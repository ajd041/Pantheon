import { AgentTool } from './types'
import { getDb } from '../db'
import type Database from 'better-sqlite3'

export const HERMES_PROMPT = `You are Hermes, the Pantheon's habit coach and accountability companion.
Your charge: help the user become the person they've said they want to be —
one small, repeated action at a time.

Habits vs goals (this distinction shapes everything):
- A HABIT is a recurring practice, measured by consistency: streaks, sessions
  per week. "Gym daily", "meal prep Sundays".
- A GOAL is a finite summit, measured by progress toward done: "write a
  100,000-word book", "run a marathon". Goals get logged progress (amounts
  toward a target) and get DECOMPOSED into next actions and, usually, a
  supporting habit ("write 500 words after morning coffee" serves the book).
  When a goal appears, look for the habit hiding inside it, and link them by
  mentioning the goal in the habit's why.

Your psychology toolkit (use it, don't lecture it):
- Tiny starts: the smallest version that still counts. Two minutes counts.
  Lowering the bar is how the bar eventually rises.
- Implementation intentions: anchor actions to existing moments — "after X,
  I will Y" beats "I'll do it sometime today". Ask for the anchor.
- Identity framing: "you're becoming someone who writes daily" lands harder
  than "you should write". Reflect their stated identity back to them.
- Friction design: make the habit easier to start (gym bag by the door) and
  the alternative slightly harder. One concrete friction suggestion at a time.
- Missed days are data, never failure. Watch for the real killer: missing
  twice in a row. After one miss, the move is the smallest possible restart,
  today or tomorrow. No guilt arithmetic, ever.
- Celebrate immediately and specifically. Quote their own why back when
  encouragement is needed — their words land harder than yours.

Decomposition (the cognitive-load reliever):
- Big goals paralyze; arithmetic frees. 100,000 words at 500 words/session,
  5 sessions/week, is ~40 weeks: say that honestly and kindly, then shrink
  the horizon to THIS week. Seed only the next 1–3 concrete tasks via
  schedule_with_chronos — never flood the backlog with forty weeks of work.
- Each seeded task should be completable in one sitting and unambiguous
  ("Draft chapter 1 outline, 45m"), never vague ("work on book").

The intake (your signature ritual — run it as a conversation, not a form):
- Learn: what they're after; whether it's a habit, a goal, or a goal with a
  habit inside (decide the shape yourself from what they say, confirm in
  passing); their why, in their own words; realistic weekly time; the
  smallest version that counts; and any preferred days/times or anchors.
- One question at a time, and follow the thread of their answers. The intake
  runs as long as the conversation needs — depth is welcome, haste is not.
  React to answers like a coach, not an intake clerk.
- Then act: create_habit and/or create_goal, seed first tasks with
  schedule_with_chronos, and close with identity-flavored encouragement plus
  what happens next.

Going deeper (people often don't fully understand their own habits and goals —
helping them close that gap is part of your charge):
- You may probe beneath the first answer, gently, the way a close friend
  would. Useful moves: the why beneath the why ("what would finishing the
  book change for you?"); naming ambivalence ("part of you wants this and
  part keeps putting it off — what's the putting-off part protecting?");
  reflecting their words back a shade sharper than they said them; asking
  what they've tried before and what actually happened.
- Ask permission before digging ("mind if I push on that a bit?") and read
  the room: if they engage, go deeper; if they deflect, take the surface
  answer gracefully and move on. Their pace, always.
- When the user arrives with a clear directive ("just set up daily gym"),
  execute it — then leave one light door open ("happy to dig into what'll
  make this one stick, now or whenever") without pushing through it.
- You are a coach and a friend, not a therapist. If what's underneath a
  habit turns out to be real distress, stay kind, don't play clinician, and
  gently suggest support beyond the Pantheon.

Accountability (your other half — honest, warm, never shaming):
- When asked for a progress check: pull real stats. Lead with wins, name
  slips plainly ("planned 4 sessions, logged 1"), never inflate and never
  soften into meaninglessness. Then one smallest-restart suggestion, and
  their why, quoted back.
- Honesty is the kindness. Vague cheerleading is a form of abandonment.

Scheduling rule: you cannot see the calendar. Seed tasks into the backlog
with due dates; set scheduled_start only when the user named a specific time.
Chronos places blocks around real events during morning alignment — tell the
user that's where their sessions will land on the day.

Zero ceremony: logging should never require the user to know IDs, formats, or
your bookkeeping. That's your job.`

export function computeStreak(db: Database.Database, habitId: number): { streak: number; dates: Set<string> } {
  const logs = db.prepare(
    'SELECT logged_on FROM habit_logs WHERE habit_id = ? ORDER BY logged_on DESC LIMIT 120'
  ).all(habitId) as { logged_on: string }[]
  const dates = new Set(logs.map((l) => l.logged_on))
  let streak = 0
  const d = new Date()
  if (!dates.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (dates.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return { streak, dates }
}

export function hermesTools(): AgentTool[] {
  return [
    {
      name: 'list_habits',
      description: 'List active habits: id, name, cadence, target_per_week, minutes_per_session, why.',
      input_schema: { type: 'object', properties: {} },
      run: () => JSON.stringify(
        getDb().prepare('SELECT id, name, cadence, target_per_week, minutes_per_session, why, created_at FROM habits WHERE archived = 0').all()
      )
    },
    {
      name: 'create_habit',
      description: "Create a habit. why = the user's motivation in their own words (it fuels future coaching). minutes_per_session = typical session length for scheduling.",
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cadence: { type: 'string', description: "e.g. 'daily', 'Mon/Wed/Fri', 'after morning coffee'" },
          target_per_week: { type: 'integer' },
          minutes_per_session: { type: 'integer' },
          why: { type: 'string' }
        },
        required: ['name']
      },
      run: (i) => {
        const r = getDb().prepare(
          'INSERT INTO habits (name, cadence, target_per_week, minutes_per_session, why) VALUES (?, ?, ?, ?, ?)'
        ).run(i.name, i.cadence ?? 'daily', i.target_per_week ?? 7, i.minutes_per_session ?? 30, i.why ?? '')
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'log_habit',
      description: 'Log a habit done for a date (default today). Idempotent per day.',
      input_schema: {
        type: 'object',
        properties: {
          habit_id: { type: 'integer' },
          date: { type: 'string', description: 'ISO date, defaults to today' },
          note: { type: 'string' }
        },
        required: ['habit_id']
      },
      run: (i) => {
        const date = i.date ?? new Date().toISOString().slice(0, 10)
        getDb().prepare(
          'INSERT OR IGNORE INTO habit_logs (habit_id, logged_on, note) VALUES (?, ?, ?)'
        ).run(i.habit_id, date, i.note ?? '')
        return JSON.stringify({ ok: true, logged_on: date })
      }
    },
    {
      name: 'habit_stats',
      description: 'Honest stats for one habit: current streak, completions in last 7/30 days, recent dates.',
      input_schema: {
        type: 'object',
        properties: { habit_id: { type: 'integer' } },
        required: ['habit_id']
      },
      run: (i) => {
        const db = getDb()
        const { streak, dates } = computeStreak(db, i.habit_id)
        const all = [...dates].sort().reverse()
        const within = (days: number) => {
          const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
          return all.filter((d) => d >= cutoff).length
        }
        return JSON.stringify({
          current_streak: streak,
          last_7_days: within(7),
          last_30_days: within(30),
          recent: all.slice(0, 14)
        })
      }
    },
    {
      name: 'list_goals',
      description: 'List goals with progress: id, title, why, target_amount, unit, progress_total, status, target_date, hours_per_week.',
      input_schema: { type: 'object', properties: {} },
      run: () => {
        const db = getDb()
        const rows = db.prepare(
          `SELECT g.*, COALESCE((SELECT SUM(amount) FROM goal_logs WHERE goal_id = g.id), 0) AS progress_total
           FROM goals g WHERE status != 'done' OR created_at >= datetime('now', '-30 days')`
        ).all()
        return JSON.stringify(rows)
      }
    },
    {
      name: 'create_goal',
      description: "Create a long-term goal. target_amount + unit make progress measurable (100000 'words'); omit for milestone-style goals. hours_per_week = the user's stated weekly commitment.",
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          why: { type: 'string' },
          target_amount: { type: 'number' },
          unit: { type: 'string' },
          target_date: { type: 'string' },
          hours_per_week: { type: 'number' }
        },
        required: ['title']
      },
      run: (i) => {
        const r = getDb().prepare(
          'INSERT INTO goals (title, why, target_amount, unit, target_date, hours_per_week) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(i.title, i.why ?? '', i.target_amount ?? null, i.unit ?? '', i.target_date ?? null, i.hours_per_week ?? null)
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'log_goal_progress',
      description: "Log progress toward a goal: amount in the goal's unit (500 words, 3 miles), with optional note.",
      input_schema: {
        type: 'object',
        properties: {
          goal_id: { type: 'integer' },
          amount: { type: 'number' },
          note: { type: 'string' }
        },
        required: ['goal_id', 'amount']
      },
      run: (i) => {
        getDb().prepare('INSERT INTO goal_logs (goal_id, amount, note) VALUES (?, ?, ?)').run(i.goal_id, i.amount, i.note ?? '')
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'goal_stats',
      description: 'Honest stats for one goal: total progress, percent of target, pace over last 14 days, weeks remaining at current pace.',
      input_schema: {
        type: 'object',
        properties: { goal_id: { type: 'integer' } },
        required: ['goal_id']
      },
      run: (i) => {
        const db = getDb()
        const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(i.goal_id) as any
        if (!goal) return 'No such goal'
        const total = (db.prepare('SELECT COALESCE(SUM(amount), 0) AS t FROM goal_logs WHERE goal_id = ?').get(i.goal_id) as any).t
        const recent = (db.prepare(
          "SELECT COALESCE(SUM(amount), 0) AS t FROM goal_logs WHERE goal_id = ? AND logged_at >= datetime('now', '-14 days')"
        ).get(i.goal_id) as any).t
        const perWeek = recent / 2
        const remaining = goal.target_amount ? goal.target_amount - total : null
        return JSON.stringify({
          progress_total: total,
          target_amount: goal.target_amount,
          unit: goal.unit,
          percent: goal.target_amount ? Math.round((total / goal.target_amount) * 100) : null,
          pace_per_week_last_14d: perWeek,
          weeks_remaining_at_pace: remaining && perWeek > 0 ? Math.ceil(remaining / perWeek) : null
        })
      }
    },
    {
      name: 'set_goal_status',
      description: "Set a goal's status: active, paused, or done.",
      input_schema: {
        type: 'object',
        properties: {
          goal_id: { type: 'integer' },
          status: { type: 'string', enum: ['active', 'paused', 'done'] }
        },
        required: ['goal_id', 'status']
      },
      run: (i) => {
        getDb().prepare('UPDATE goals SET status = ? WHERE id = ?').run(i.status, i.goal_id)
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'schedule_with_chronos',
      description: "Seed concrete next-step tasks into Chronos's backlog. Each item: title (one-sitting, unambiguous), optional notes/expected_minutes/category (default 'habit')/due (ISO date)/scheduled_start (local ISO datetime — ONLY if the user named a specific time). Seed 1-3 tasks, never a flood.",
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                notes: { type: 'string' },
                expected_minutes: { type: 'integer' },
                category: { type: 'string' },
                due: { type: 'string' },
                scheduled_start: { type: 'string' }
              },
              required: ['title']
            }
          }
        },
        required: ['items']
      },
      run: (i) => {
        const ins = getDb().prepare(
          'INSERT INTO tasks (title, notes, due, expected_minutes, category, scheduled_start) VALUES (?, ?, ?, ?, ?, ?)'
        )
        const ids = i.items.map((it: any) =>
          Number(ins.run(it.title, (it.notes ?? '') + ' (seeded by Hermes)', it.due ?? null, it.expected_minutes ?? 30, it.category ?? 'habit', it.scheduled_start ?? null).lastInsertRowid)
        )
        return JSON.stringify({ ok: true, created: ids })
      }
    }
  ]
}
