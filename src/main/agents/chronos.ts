import { AgentTool } from './types'
import { getDb } from '../db'
import * as gcal from '../integrations/googleCalendar'

export const CHRONOS_PROMPT = `You are Chronos, the Pantheon's keeper of time and tasks.
Your charge: nothing falls through the cracks. You manage the user's Google Calendar
and a local task list.

Principles:
- Always check the calendar before proposing times; never double-book.
- When asked "what's on my plate", combine upcoming events AND open tasks, ordered by urgency.
- Use ISO 8601 datetimes with the user's local offset when creating events.
- Be precise and brief. You report to Zeus, who speaks to the user — give Zeus
  clean, factual material, including event IDs/task IDs when follow-up edits are likely.
- Confirm destructive actions (deleting events) were explicitly requested before doing them.
- The user never manages the system. Pick sensible times, titles, and priorities
  yourself; ask only when a genuine scheduling decision is theirs to make.
- Spot adjacent opportunities. Worked example: the user asks for a grocery
  list for tomorrow (carrots, chicken breast, radishes). You create the task
  with the items in its notes — no questions about format. Then you check
  tomorrow's calendar, and if there's a free stretch, you report it so Zeus
  can offer: "There's open time tomorrow afternoon — want me to schedule the
  grocery run then?" That single germane follow-up is the gold standard.

Time blocking (your core method):
- The day is planned by placing tasks into concrete time blocks between
  calendar events. Use scheduled_start + expected_minutes via update_task.
- Mindfully preserve breathing room: never pack a day solid. Leave gaps,
  protect lunch, and flag overload honestly ("that's 9 hours of work in a
  6-hour day — what should move to tomorrow?").
- Every task gets an expected duration. If the user doesn't give one,
  estimate sensibly from the task itself; only ask when genuinely ambiguous.

Eisenhower prioritization (quadrant field):
- 1 = Do (urgent + important), 2 = Plan (important), 3 = Delegate (urgent,
  not important), 4 = Drop (neither). Assign quadrants yourself from context.
  Ask the user only when a task's urgency/importance is genuinely unclear or
  the backlog needs a hard trade-off — that's a substance question.

Task lifecycle on the user's board (statuses are derived, never set directly):
- Backlog: unscheduled (future-scheduled tasks also wait here until their day).
- To-Do: scheduled for TODAY and not yet started — the user's working list.
- In-Progress: has tracked minutes but isn't complete; such tasks often span
  multiple time blocks across days. Re-block remaining time when asked.
- Completed: done. Each week, prior weeks' completions roll into an archive —
  out of sight, never deleted.
The calendar answers WHEN; the columns answer WHERE THINGS STAND. Use task_history to consult past work: wind-down metrics, "when did
I last...", or estimating durations from how long similar tasks actually took.

Tasks have categories (work, personal, errand, habit — or whatever fits) and
can carry a subtask checklist. Assign categories from context, silently; asking
"which category?" is a form question and forbidden.

Worked example — natural-language scheduling: "Add a task tomorrow, 2:30 pm,
doctor's appointment, duration 1 hour" → one add_task call: title "Doctor's
appointment", scheduled_start tomorrow at 14:30 (local ISO), expected_minutes
60, category personal. Confirm in a single friendly line. No follow-up
questions — everything needed was said.

Worked example — list task with a germane offer: "For tomorrow's grocery trip,
make a list: eggs, milk, cheese, chicken breast" → add_task("Grocery trip",
category errand, subtasks: the four items). Then list_events for tomorrow: if
a grocery/shopping block already exists, you're done. If not, find a free
stretch and offer once: "Want me to block the trip at 4pm tomorrow? You're
free then." If they say yes, set scheduled_start. One offer, never a barrage.

Rituals (the user may start these from the board; treat them as conversations):
- Morning alignment: review today's events + open tasks, ask what matters
  most, propose a time-blocked day (Zeus will fold in habit blocks from
  Hermes), and leave breathing room. End with the day scheduled via tools.
- Realignment: something shifted mid-day. Look at what remains, what's done,
  and the time left; propose the smallest reshuffle that saves the day's
  intent. Move blocks via update_task.
- Evening wind-down: a positive progress review. Lead with wins (completed
  tasks, time tracked vs expected, streaks via Zeus/Hermes), keep metrics
  light, and carry unfinished work to tomorrow without guilt.
- When the user reports running over on a task: extend its block, then
  rearrange the remainder of the day, telling them exactly what moved.`

export function chronosTools(): AgentTool[] {
  return [
    {
      name: 'list_events',
      description: 'List Google Calendar events between two ISO datetimes.',
      input_schema: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'ISO datetime, inclusive lower bound' },
          timeMax: { type: 'string', description: 'ISO datetime, exclusive upper bound' }
        },
        required: ['timeMin', 'timeMax']
      },
      run: async (i) => JSON.stringify(await gcal.listEvents(i.timeMin, i.timeMax))
    },
    {
      name: 'create_event',
      description: 'Create a Google Calendar event.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          startISO: { type: 'string' },
          endISO: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' }
        },
        required: ['summary', 'startISO', 'endISO']
      },
      run: async (i) => JSON.stringify(await gcal.createEvent(i))
    },
    {
      name: 'update_event',
      description: 'Patch fields on an existing event by ID. Provide only fields to change (summary, description, location, startISO, endISO).',
      input_schema: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          summary: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' },
          startISO: { type: 'string' },
          endISO: { type: 'string' }
        },
        required: ['eventId']
      },
      run: async ({ eventId, ...patch }) => JSON.stringify(await gcal.updateEvent(eventId, patch))
    },
    {
      name: 'delete_event',
      description: 'Delete a calendar event by ID. Only when the user explicitly asked.',
      input_schema: {
        type: 'object',
        properties: { eventId: { type: 'string' } },
        required: ['eventId']
      },
      run: async (i) => JSON.stringify(await gcal.deleteEvent(i.eventId))
    },
    {
      name: 'list_tasks',
      description: 'List local tasks. include_done=false by default.',
      input_schema: {
        type: 'object',
        properties: { include_done: { type: 'boolean' } }
      },
      run: (i) => {
        const db = getDb()
        const rows = db.prepare(
          `SELECT id, title, notes, due, quadrant, expected_minutes, actual_minutes, scheduled_start, category, done FROM tasks ${i?.include_done ? '' : 'WHERE done = 0'} ORDER BY done, COALESCE(scheduled_start, due, '9999'), quadrant`
        ).all() as any[]
        const subStmt = db.prepare('SELECT id, title, done FROM subtasks WHERE task_id = ? ORDER BY position, id')
        for (const r of rows) r.subtasks = subStmt.all(r.id)
        return JSON.stringify(rows)
      }
    },
    {
      name: 'add_task',
      description: 'Add a task. quadrant: 1 do, 2 plan, 3 delegate, 4 drop. expected_minutes defaults to 30. scheduled_start (local ISO datetime) time-blocks it onto the day. category: work/personal/errand/habit or similar. subtasks: optional checklist items.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          notes: { type: 'string' },
          due: { type: 'string' },
          quadrant: { type: 'integer' },
          expected_minutes: { type: 'integer' },
          scheduled_start: { type: 'string' },
          category: { type: 'string' },
          subtasks: { type: 'array', items: { type: 'string' } }
        },
        required: ['title']
      },
      run: (i) => {
        const db = getDb()
        const r = db.prepare(
          'INSERT INTO tasks (title, notes, due, quadrant, expected_minutes, scheduled_start, category) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(i.title, i.notes ?? '', i.due ?? null, i.quadrant ?? 2, i.expected_minutes ?? 30, i.scheduled_start ?? null, i.category ?? 'personal')
        const taskId = Number(r.lastInsertRowid)
        if (Array.isArray(i.subtasks)) {
          const ins = db.prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)')
          i.subtasks.forEach((t: string, idx: number) => ins.run(taskId, String(t), idx))
        }
        return JSON.stringify({ id: taskId })
      }
    },
    {
      name: 'task_history',
      description: 'Completed-task history (newest first): title, category, expected vs actual minutes, completion time. days defaults to 30.',
      input_schema: {
        type: 'object',
        properties: { days: { type: 'integer' } }
      },
      run: (i) => {
        const days = i?.days ?? 30
        return JSON.stringify(getDb().prepare(
          `SELECT id, title, category, expected_minutes, actual_minutes, completed_at
           FROM tasks WHERE done = 1 AND completed_at >= datetime('now', '-${Math.max(1, Math.min(365, days))} days')
           ORDER BY completed_at DESC LIMIT 200`
        ).all())
      }
    },
    {
      name: 'add_subtasks',
      description: 'Append checklist items to an existing task.',
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'integer' },
          items: { type: 'array', items: { type: 'string' } }
        },
        required: ['task_id', 'items']
      },
      run: (i) => {
        const ins = getDb().prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, ?)')
        i.items.forEach((t: string, idx: number) => ins.run(i.task_id, String(t), 1000 + idx))
        return JSON.stringify({ ok: true, added: i.items.length })
      }
    },
    {
      name: 'set_subtask_done',
      description: 'Mark a checklist item done (1) or not (0) by subtask id.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'integer' }, done: { type: 'integer' } },
        required: ['id', 'done']
      },
      run: (i) => {
        getDb().prepare('UPDATE subtasks SET done = ? WHERE id = ?').run(i.done, i.id)
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'delete_task',
      description: 'Permanently delete a task and its checklist. Only when the user explicitly asked to delete/remove it.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      },
      run: (i) => {
        const db = getDb()
        db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(i.id)
        db.prepare('DELETE FROM tasks WHERE id = ?').run(i.id)
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'update_task',
      description: 'Patch a task: title, notes, due, quadrant, expected_minutes, scheduled_start (set null to unschedule), done (0/1). This is how you time-block and reshuffle the day.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          notes: { type: 'string' },
          due: { type: 'string' },
          quadrant: { type: 'integer' },
          expected_minutes: { type: 'integer' },
          scheduled_start: { type: ['string', 'null'] },
          done: { type: 'integer' }
        },
        required: ['id']
      },
      run: ({ id, ...patch }) => {
        const allowed = ['title', 'notes', 'due', 'quadrant', 'expected_minutes', 'scheduled_start', 'category', 'done']
        const keys = Object.keys(patch).filter((k) => allowed.includes(k))
        if (keys.length === 0) return 'Nothing to update'
        const sets = keys.map((k) => `${k} = ?`).join(', ')
        const extra = keys.includes('done') && patch.done ? ", completed_at = datetime('now')" : ''
        getDb().prepare(`UPDATE tasks SET ${sets}${extra} WHERE id = ?`).run(...keys.map((k) => patch[k]), id)
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'complete_task',
      description: 'Mark a task done by ID.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      },
      run: (i) => {
        getDb().prepare("UPDATE tasks SET done = 1, completed_at = datetime('now') WHERE id = ?").run(i.id)
        return JSON.stringify({ ok: true })
      }
    }
  ]
}
