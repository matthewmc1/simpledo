import { apiGet } from "./http";

export interface GoogleStatus {
  connected: boolean;
  calendarScopeGranted: boolean;
  code?: "not_connected" | "needs_reconsent" | "refresh_failed";
}

export interface GoogleCalendar {
  id: string;
  name: string;
  primary: boolean;
  color: string | null;
}

export interface GoogleEvent {
  id: string;
  calendarId: string;
  calendarName: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
}

export async function fetchGoogleStatus(): Promise<GoogleStatus> {
  return apiGet<GoogleStatus>("/api/google/status");
}

export async function fetchGoogleCalendars(): Promise<GoogleCalendar[]> {
  const data = await apiGet<{ calendars: GoogleCalendar[] }>("/api/google/calendars");
  return data.calendars;
}

export async function fetchGoogleEvents(
  fromIso: string,
  toIso: string,
  calendarIds?: string[],
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({ from: fromIso, to: toIso });
  if (calendarIds && calendarIds.length > 0) {
    params.set("calendarIds", calendarIds.join(","));
  }
  const data = await apiGet<{ events: GoogleEvent[] }>(`/api/google/events?${params}`);
  return data.events;
}
