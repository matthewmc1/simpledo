import { Hono } from "hono";
import { HTTPError, requireUser, type Env } from "../middleware/session";
import {
  GoogleAuthError,
  getGoogleAccessToken,
  hasCalendarScope,
} from "../integrations/google";

const router = new Hono<Env>();

const CAL_API = "https://www.googleapis.com/calendar/v3";

interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  accessRole?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  status?: string;
}

function bubbleAuthError(e: unknown): never {
  if (e instanceof GoogleAuthError) {
    // 412 = "Precondition Failed" — we use it to signal "your Google account
    // isn't ready". The client looks at the `code` to decide what to show
    // (connect-CTA vs reconsent-CTA).
    throw new HTTPError(412, JSON.stringify({ code: e.code, message: e.message }));
  }
  if (e instanceof Error) throw new HTTPError(502, `Google API error: ${e.message}`);
  throw new HTTPError(502, "Google API error");
}

/** Status endpoint — surfaced by the client to decide whether to show the
 *  Connect-Google CTA, the Reconnect-Google CTA, or the calendar itself. */
router.get("/google/status", async (c) => {
  const user = requireUser(c);
  try {
    await getGoogleAccessToken(user.id);
    const calendarOk = await hasCalendarScope(user.id);
    return c.json({
      connected: true,
      calendarScopeGranted: calendarOk,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return c.json({
        connected: e.code !== "not_connected",
        calendarScopeGranted: false,
        code: e.code,
      });
    }
    throw e;
  }
});

/** Lists the user's Google calendars (primary first). */
router.get("/google/calendars", async (c) => {
  const user = requireUser(c);
  let token: string;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch (e) {
    bubbleAuthError(e);
  }

  const res = await fetch(`${CAL_API}/users/me/calendarList?minAccessRole=reader`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new HTTPError(502, `Google calendarList ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { items: GoogleCalendar[] };
  const calendars = (data.items ?? [])
    .map((c) => ({
      id: c.id,
      name: c.summary,
      primary: !!c.primary,
      color: c.backgroundColor ?? null,
    }))
    .sort((a, b) => (a.primary ? -1 : b.primary ? 1 : a.name.localeCompare(b.name)));
  return c.json({ calendars });
});

/** Lists events across one or more calendars in a date range.
 *  `from` / `to` are ISO timestamps.
 *  Optional `calendarIds` query param (comma-separated) to filter; default is "primary". */
router.get("/google/events", async (c) => {
  const user = requireUser(c);
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) throw new HTTPError(400, "from and to are required (ISO timestamps)");
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate < fromDate) {
    throw new HTTPError(400, "Invalid from/to range");
  }

  let token: string;
  try {
    token = await getGoogleAccessToken(user.id);
  } catch (e) {
    bubbleAuthError(e);
  }

  const calendarIdsParam = c.req.query("calendarIds");
  const calendarIds = calendarIdsParam
    ? calendarIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : ["primary"];

  const fetchOne = async (calendarId: string): Promise<NormalizedEvent[]> => {
    const params = new URLSearchParams({
      timeMin: fromDate.toISOString(),
      timeMax: toDate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const url = `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // Soft-fail per-calendar; 404 here usually means the user disconnected
      // that calendar between calls.
      console.warn(`google events ${calendarId} → ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { items: GoogleEvent[]; summary?: string };
    return (data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => normalize(e, calendarId, data.summary));
  };

  const results = await Promise.all(calendarIds.map(fetchOne));
  const events = results.flat().sort((a, b) => a.start.localeCompare(b.start));
  return c.json({ events });
});

interface NormalizedEvent {
  id: string;
  calendarId: string;
  calendarName: string | null;
  title: string;
  description: string | null;
  location: string | null;
  /** ISO timestamp. All-day events are stored as the day's local midnight. */
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

function normalize(
  e: GoogleEvent,
  calendarId: string,
  calendarName: string | undefined,
): NormalizedEvent {
  const allDay = !!e.start.date && !e.start.dateTime;
  const start = e.start.dateTime ?? `${e.start.date}T00:00:00.000Z`;
  const end = e.end.dateTime ?? `${e.end.date}T00:00:00.000Z`;
  return {
    id: e.id,
    calendarId,
    calendarName: calendarName ?? null,
    title: e.summary ?? "(no title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start,
    end,
    allDay,
    htmlLink: e.htmlLink ?? null,
  };
}

export const googleRoutes = router;
