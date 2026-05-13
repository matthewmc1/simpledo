import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { session as sessionTable } from "../db/schema";
import { LOCAL_SESSION_COOKIE, type Env } from "../middleware/session";

const router = new Hono<Env>();

router.get("/me", (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null }, 200);
  return c.json({ user });
});

/**
 * Logs the current user out. Better Auth handles its own /api/auth/sign-out;
 * this endpoint covers the demo cookie path, and we call BOTH from the client
 * so a single button works regardless of provider.
 */
router.post("/me/sign-out", async (c) => {
  const user = c.get("user");
  if (user) {
    // Wipe any demo sessions for this user.
    await db.delete(sessionTable).where(eq(sessionTable.userId, user.id));
  }
  deleteCookie(c, LOCAL_SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

export const meRoutes = router;
