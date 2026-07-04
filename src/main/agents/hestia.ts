import { AgentTool } from './types'
import { getDb } from '../db'

export const HESTIA_PROMPT = `You are Hestia, the Pantheon's keeper of the hearth: meals, movement,
energy, and how the user is actually feeling.

Principles:
- Logging should be frictionless. Accept loose descriptions ("big salad, some
  chicken") without demanding macros. Estimate calories only if asked, and say
  it's an estimate.
- Look for honest patterns when summarizing: energy vs. sleep vs. meals vs.
  workouts. Correlation offered gently, never as diagnosis.
- Never moralize about food. No "good" or "bad" foods, no guilt framing.
- You are not a doctor or dietitian; for medical concerns, say a professional
  should be consulted.
- You report to Zeus; give clean factual summaries.
- Zero ceremony: a loose sentence is a complete log entry. Never ask the user
  to structure their input.`

export function hestiaTools(): AgentTool[] {
  return [
    {
      name: 'log_meal',
      description: 'Log a meal. tags like "breakfast,snack" optional; calories optional.',
      input_schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          calories: { type: 'integer' },
          tags: { type: 'string' },
          eaten_at: { type: 'string', description: 'ISO datetime; defaults to now' }
        },
        required: ['description']
      },
      run: (i) => {
        const r = getDb().prepare(
          "INSERT INTO meals (description, calories, tags, eaten_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))"
        ).run(i.description, i.calories ?? null, i.tags ?? '', i.eaten_at ?? null)
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'log_workout',
      description: 'Log a workout. intensity: light | moderate | hard.',
      input_schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          duration_min: { type: 'integer' },
          intensity: { type: 'string' },
          done_at: { type: 'string' }
        },
        required: ['description']
      },
      run: (i) => {
        const r = getDb().prepare(
          "INSERT INTO workouts (description, duration_min, intensity, done_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))"
        ).run(i.description, i.duration_min ?? null, i.intensity ?? 'moderate', i.done_at ?? null)
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'log_energy',
      description: 'Log energy (1 drained .. 5 energized), optional mood word and note.',
      input_schema: {
        type: 'object',
        properties: {
          energy: { type: 'integer' },
          mood: { type: 'string' },
          note: { type: 'string' }
        },
        required: ['energy']
      },
      run: (i) => {
        const r = getDb().prepare(
          'INSERT INTO energy_logs (energy, mood, note) VALUES (?, ?, ?)'
        ).run(i.energy, i.mood ?? '', i.note ?? '')
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'get_logs',
      description: 'Fetch recent logs of one kind: meals | workouts | energy. days defaults to 7.',
      input_schema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['meals', 'workouts', 'energy'] },
          days: { type: 'integer' }
        },
        required: ['kind']
      },
      run: (i) => {
        const days = i.days ?? 7
        const db = getDb()
        const q = {
          meals: `SELECT id, eaten_at, description, calories, tags FROM meals WHERE eaten_at >= datetime('now', '-${days} days') ORDER BY eaten_at DESC`,
          workouts: `SELECT id, done_at, description, duration_min, intensity FROM workouts WHERE done_at >= datetime('now', '-${days} days') ORDER BY done_at DESC`,
          energy: `SELECT id, logged_at, energy, mood, note FROM energy_logs WHERE logged_at >= datetime('now', '-${days} days') ORDER BY logged_at DESC`
        }[i.kind as 'meals' | 'workouts' | 'energy']
        if (!q) return 'Unknown kind'
        return JSON.stringify(db.prepare(q).all())
      }
    }
  ]
}
