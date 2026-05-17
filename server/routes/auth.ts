import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { auth } from "../auth";
import { db } from "../db/client";
import { session as sessionTable, user as userTable } from "../db/schema";
import { createRateLimiter } from "../middleware/rateLimit";
import { HTTPError, LOCAL_SESSION_COOKIE, type Env } from "../middleware/session";
import { seedDemoUser } from "../seed/demo";
import { EmailSignInSchema } from "../../shared/types";

// Conservative caps — these endpoints both create user rows server-side, so
// we want to make abuse expensive. A real human hits demo once and email
// maybe a handful of times per day; these limits leave plenty of headroom.
const demoLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1h
  max: 5,
  label: "demo sign-in",
});
const emailLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10m
  max: 10,
  label: "email sign-in",
});

const router = new Hono<Env>();

const SESSION_DAYS = 7;

/** Generate an opaque, large session token. */
function generateToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "")
  );
}

/** Issue a local session for `userId` and set the cookie on the response. */
async function issueLocalSession(c: Context<Env>, userId: string): Promise<void> {
  const token = generateToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessionTable).values({
    id: sessionId,
    userId,
    token,
    expiresAt,
  });

  setCookie(c, LOCAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: false, // dev only — flip behind HTTPS
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/**
 * Demo flow — creates an `is_demo` user with Mira's fixtures and an opaque
 * session cookie. Registered BEFORE the Better Auth catch-all so it matches
 * first. Side-steps Better Auth's signed-cookie format on purpose (see
 * middleware/session.ts for the dual-cookie resolver).
 */
router.post("/auth/demo", demoLimiter, async (c) => {
  const id = crypto.randomUUID();
  const tag = id.slice(0, 8);

  const [u] = await db
    .insert(userTable)
    .values({
      id,
      name: "Demo · Mira Adeyemi",
      email: `demo-${tag}@simply.do`,
      emailVerified: true,
      isDemo: true,
    })
    .returning();

  await seedDemoUser(u.id);
  await issueLocalSession(c, u.id);

  return c.json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      isDemo: true,
    },
  });
});

/**
 * Local email-only sign-in (no password). For dev / single-machine use:
 * trusts whatever email the user types, creates the row on first use, returns
 * a session cookie. NOT safe for production — anyone who knows an email can
 * sign in as that user. The seam is intentional so a real email verification
 * step can be added later without changing the call sites.
 */
router.post("/auth/email", emailLimiter, async (c) => {
  const body = (await c.req.json().catch(() => null)) as unknown;
  const parsed = EmailSignInSchema.safeParse(body);
  if (!parsed.success) throw new HTTPError(400, "Valid email required");
  const email = parsed.data.email.trim().toLowerCase();

  let [u] = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1);
  if (!u) {
    const id = crypto.randomUUID();
    const name = email.split("@")[0] || email;
    [u] = await db
      .insert(userTable)
      .values({
        id,
        name,
        email,
        emailVerified: false,
        isDemo: false,
      })
      .returning();
  }

  await issueLocalSession(c, u.id);

  return c.json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image,
      isDemo: u.isDemo,
    },
  });
});

// Mount Better Auth's handler on /api/auth/* — Google sign-in, callbacks,
// sign-out, session refresh, etc. Registered LAST so the specific routes
// above match first.
router.all("/auth/*", (c) => auth.handler(c.req.raw));

// `and` is reserved for future ownership checks here.
void and;

export const authRoutes = router;
