import { eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import { auth } from "../auth";
import { db } from "../db/client";
import { session as sessionTable, user as userTable } from "../db/schema";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  isDemo: boolean;
};

export type Env = {
  Variables: {
    user: AppUser | null;
  };
};

export const LOCAL_SESSION_COOKIE = "simply-do.session";

/**
 * Resolves the user from EITHER Better Auth's signed cookie (Google sign-in)
 * OR our own demo cookie (opaque token, no signing needed). Both flows write
 * to the same `session` table — the dual cookie names just avoid colliding
 * with Better Auth's signature format.
 */
export const resolveSession: MiddlewareHandler<Env> = async (c, next) => {
  // 1. Better Auth path (Google, etc.)
  const baResult = await auth.api.getSession({ headers: c.req.raw.headers });
  if (baResult?.user) {
    const u = baResult.user as typeof baResult.user & { isDemo?: boolean };
    c.set("user", {
      id: u.id,
      email: u.email,
      name: u.name,
      image: u.image ?? null,
      isDemo: !!u.isDemo,
    });
    return next();
  }

  // 2. Local session (demo or email-only auth)
  const localToken = getCookie(c, LOCAL_SESSION_COOKIE);
  if (localToken) {
    const rows = await db
      .select()
      .from(sessionTable)
      .innerJoin(userTable, eq(userTable.id, sessionTable.userId))
      .where(eq(sessionTable.token, localToken))
      .limit(1);
    const row = rows[0];
    if (row && row.session.expiresAt > new Date()) {
      c.set("user", {
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        image: row.user.image,
        isDemo: row.user.isDemo,
      });
      return next();
    }
  }

  c.set("user", null);
  await next();
};

/** Use after resolveSession on routes that need a logged-in user. */
export function requireUser(c: Context<Env>): AppUser {
  const u = c.get("user");
  if (!u) throw new HTTPError(401, "Not authenticated");
  return u;
}

export class HTTPError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// eq/gt unused-import guard for future expansion.
void gt;
