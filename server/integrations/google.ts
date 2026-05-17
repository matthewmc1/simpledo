import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { account } from "../db/schema";
import { env } from "../env";

/** Buffer before token expiry to refresh proactively (60s). Google's tokens
 *  are 1h; this keeps us off the edge. */
const REFRESH_BUFFER_MS = 60_000;

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    /** "not_connected" — user has no Google account row, ask them to sign in via Google.
     *  "needs_reconsent" — refresh token absent or revoked, user must re-grant. */
    public readonly code: "not_connected" | "needs_reconsent" | "refresh_failed",
  ) {
    super(message);
  }
}

interface AccountRow {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  scope: string | null;
}

async function loadGoogleAccount(userId: string): Promise<AccountRow | null> {
  const [row] = await db
    .select({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      scope: account.scope,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")))
    .limit(1);
  return row ?? null;
}

/** Refreshes the Google access token using the stored refresh token, persists
 *  the new access_token + expiry, returns the fresh access_token. */
async function refreshAccessToken(row: AccountRow): Promise<string> {
  if (!row.refreshToken) {
    throw new GoogleAuthError(
      "Missing refresh token — user must re-consent.",
      "needs_reconsent",
    );
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: row.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Google returns `invalid_grant` when the user revoked access or the
    // refresh token is otherwise dead — bubble that as needs_reconsent.
    if (text.includes("invalid_grant")) {
      throw new GoogleAuthError(
        "Refresh token is no longer valid — user must reconnect Google.",
        "needs_reconsent",
      );
    }
    throw new GoogleAuthError(
      `Google token refresh failed (${res.status}): ${text}`,
      "refresh_failed",
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
  };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);

  await db
    .update(account)
    .set({
      accessToken: json.access_token,
      accessTokenExpiresAt: expiresAt,
      // Google sometimes returns a refreshed scope set; preserve it if present.
      scope: json.scope ?? row.scope,
      updatedAt: new Date(),
    })
    .where(eq(account.id, row.id));

  return json.access_token;
}

/** Returns a valid Google access_token for the user, refreshing if needed. */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const row = await loadGoogleAccount(userId);
  if (!row) {
    throw new GoogleAuthError(
      "User has not connected Google.",
      "not_connected",
    );
  }
  const now = Date.now();
  const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
  const valid = row.accessToken && expiresAt - now > REFRESH_BUFFER_MS;
  if (valid) return row.accessToken!;
  return refreshAccessToken(row);
}

/** Convenience: did the user grant the calendar scope? */
export async function hasCalendarScope(userId: string): Promise<boolean> {
  const row = await loadGoogleAccount(userId);
  if (!row || !row.scope) return false;
  return row.scope.includes("calendar.readonly") || row.scope.includes("calendar.events.readonly");
}
