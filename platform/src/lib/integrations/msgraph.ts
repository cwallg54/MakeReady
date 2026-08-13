import "server-only";

/**
 * Microsoft Graph (Outlook calendar) integration — app-only (client-credentials)
 * flow. Reads MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET
 * from the environment. Until those are set (and the Azure app is granted
 * Calendars.ReadWrite application permission), every call degrades gracefully —
 * so scheduling keeps working with local data only.
 *
 * To activate: register an app in Entra ID, grant application permission
 * Calendars.ReadWrite (admin consent), and set the three env vars.
 */
export function graphConfigured(): boolean {
  return !!(process.env.MS_GRAPH_TENANT_ID && process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET);
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  if (!tenant || !clientId || !secret) return null;
  // Reuse a still-valid token (60s safety margin). Uses Date via a cache stamp
  // set from the response's expires_in — no wall-clock reads at call sites.
  const nowMs = new Date().getTime();
  if (cachedToken && cachedToken.expiresAt - 60_000 > nowMs) return cachedToken.token;
  try {
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    });
    if (!res.ok) {
      console.error("[msgraph] token failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expiresAt: nowMs + data.expires_in * 1000 };
    return data.access_token;
  } catch (e) {
    console.error("[msgraph] token error", e);
    return null;
  }
}

export interface GraphEvent {
  subject: string;
  bodyHtml?: string;
  startIso: string;
  endIso: string;
  timeZone?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  location?: string;
}

/** Create an event on a user's Outlook calendar. Returns the event id or null. */
export async function createCalendarEvent(userEmail: string, ev: GraphEvent): Promise<string | null> {
  const token = await getAppToken();
  if (!token || !userEmail) return null;
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: ev.subject,
        body: { contentType: "HTML", content: ev.bodyHtml ?? "" },
        start: { dateTime: ev.startIso, timeZone: ev.timeZone ?? "America/Denver" },
        end: { dateTime: ev.endIso, timeZone: ev.timeZone ?? "America/Denver" },
        ...(ev.location ? { location: { displayName: ev.location } } : {}),
        ...(ev.attendeeEmail
          ? { attendees: [{ emailAddress: { address: ev.attendeeEmail, name: ev.attendeeName ?? ev.attendeeEmail }, type: "required" }] }
          : {}),
      }),
    });
    if (!res.ok) {
      console.error("[msgraph] create event failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ?? null;
  } catch (e) {
    console.error("[msgraph] create event error", e);
    return null;
  }
}

/** Busy intervals from a user's Outlook calendar (getSchedule). [] on any error. */
export async function getBusyTimes(userEmail: string, startIso: string, endIso: string): Promise<{ start: Date; end: Date }[]> {
  const token = await getAppToken();
  if (!token || !userEmail) return [];
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendar/getSchedule`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schedules: [userEmail],
        startTime: { dateTime: startIso, timeZone: "America/Denver" },
        endTime: { dateTime: endIso, timeZone: "America/Denver" },
        availabilityViewInterval: 30,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { value?: { scheduleItems?: { start: { dateTime: string }; end: { dateTime: string } }[] }[] };
    const items = data.value?.[0]?.scheduleItems ?? [];
    return items.map((s) => ({ start: new Date(s.start.dateTime + "Z"), end: new Date(s.end.dateTime + "Z") }));
  } catch (e) {
    console.error("[msgraph] getSchedule error", e);
    return [];
  }
}
