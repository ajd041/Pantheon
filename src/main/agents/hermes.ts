import { AgentTool } from './types'
import { getDb } from '../db'

export const HERMES_PROMPT = `You are Hermes, the Pantheon's swift companion for habits and momentum.
Your charge: help the user build habits that stick, with gentle, practical coaching.

Principles:
- Coaching style: warm, concrete, never preachy. Favor tiny starts ("two minutes
  counts") and identity framing ("you're becoming someone who...").
- Each habit stores a "why" — the user's own motivation. Quote it back when
  encouragement is needed; their words land harder than yours.
- Streaks motivate but broken streaks shouldn't shame. A missed day is data,
  not failure; suggest the smallest possible restart.
- When asked for stats, compute honestly. Never inflate progress.
- You report to Zeus; give clean material with habit IDs where relevant.
- Zero ceremony: logging a habit should never require the user to know IDs,
  formats, or your bookkeeping. That's your job.
- When a NEW habit is created, germane questions are encouraged — the "why",
  realistic cadence, the smallest version of the habit that still counts.
  These serve the habit's purpose. Questions about tracking mechanics never
  reach the user; you just handle them.`

export function hermesTools(): AgentTool[] {
  return [
    {
      name: 'list_habits',
      description: 'List active habits with id, name, cadence, target_per_week, why.',
      input_schema: { type: 'object', properties: {} },
      run: () => JSON.stringify(
        getDb().prepare('SELECT id, name, cadence, target_per_week, why, created_at FROM habits WHERE archived = 0').all()
      )
    },
    {
      name: 'create_habit',
      description: 'Create a habit. Ask the user for a "why" if not given — it fuels future coaching.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cadence: { type: 'string', description: "e.g. 'daily', 'weekly', 'Mon/Wed/Fri'" },
          target_per_week: { type: 'integer' },
          why: { type: 'string' }
        },
        required: ['name']
      },
      run: (i) => {
        const r = getDb().prepare(
          'INSERT INTO habits (name, cadence, target_per_week, why) VALUES (?, ?, ?, ?)'
        ).run(i.name, i.cadence ?? 'daily', i.target_per_week ?? 7, i.why ?? '')
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'log_habit',
      description: 'Log a habit as done for a date (default today). Idempotent per day.',
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
      description: 'Stats for one habit: current streak, completions in last 7/30 days, recent log dates.',
      input_schema: {
        type: 'object',
        properties: { habit_id: { type: 'integer' } },
        required: ['habit_id']
      },
      run: (i) => {
        const db = getDb()
        const logs = db.prepare(
          'SELECT logged_on FROM habit_logs WHERE habit_id = ? ORDER BY logged_on DESC LIMIT 90'
        ).all(i.habit_id) as { logged_on: string }[]
        const dates = new Set(logs.map((l) => l.logged_on))
        let streak = 0
        const d = new Date()
        // A streak counts today if logged, otherwise starts from yesterday.
        if (!dates.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
        while (dates.has(d.toISOString().slice(0, 10))) {
          streak++
          d.setDate(d.getDate() - 1)
        }
        const within = (days: number) => {
          const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
          return logs.filter((l) => l.logged_on >= cutoff).length
        }
        return JSON.stringify({
          current_streak: streak,
          last_7_days: within(7),
          last_30_days: within(30),
          recent: logs.slice(0, 14).map((l) => l.logged_on)
        })
      }
    }
  ]
}
