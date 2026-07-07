import { getDb } from './db'
import * as gcal from './integrations/googleCalendar'

/**
 * One-way mirror: a scheduled, not-done task owns exactly one Google Calendar
 * event (tagged with pantheonTaskId so the app doesn't render it twice).
 * Pantheon is the source of truth; Google is the reflection. Any failure
 * (calendar not connected, offline) degrades silently to local-only.
 */
export async function syncTaskCalendar(taskId: number): Promise<void> {
  const db = getDb()
  const t = db.prepare(
    'SELECT id, title, expected_minutes, scheduled_start, done, gcal_event_id FROM tasks WHERE id = ?'
  ).get(taskId) as any
  if (!t) return
  try {
    const shouldExist = !!t.scheduled_start && !t.done
    if (!shouldExist) {
      if (t.gcal_event_id) {
        try { await gcal.deleteEvent(t.gcal_event_id) } catch { /* already gone */ }
        db.prepare('UPDATE tasks SET gcal_event_id = NULL WHERE id = ?').run(t.id)
      }
      return
    }
    const start = new Date(t.scheduled_start)
    const end = new Date(start.getTime() + (t.expected_minutes ?? 30) * 60_000)
    if (t.gcal_event_id) {
      await gcal.updateEvent(t.gcal_event_id, {
        summary: t.title, startISO: start.toISOString(), endISO: end.toISOString()
      })
    } else {
      const r = await gcal.createEvent({
        summary: t.title,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        description: 'Time-blocked in Pantheon',
        privateProps: { pantheonTaskId: String(t.id) }
      })
      if (r.id) db.prepare('UPDATE tasks SET gcal_event_id = ? WHERE id = ?').run(r.id, t.id)
    }
  } catch { /* calendar unavailable — task stays local-only */ }
}

export async function removeTaskEvent(gcalEventId: string | null | undefined): Promise<void> {
  if (!gcalEventId) return
  try { await gcal.deleteEvent(gcalEventId) } catch { /* already gone */ }
}
