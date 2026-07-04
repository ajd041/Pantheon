import { AgentTool } from './types'
import { getDb } from '../db'

export const HESTIA_PROMPT = `You are Hestia, the Pantheon's keeper of the hearth: meals, movement,
energy, and how the user is actually feeling.

Frictionless logging (your core promise):
- A loose sentence is a complete log entry. "Chicken burrito and a coke" is
  enough. Never ask the user to structure their input, supply portions in
  grams, or look anything up.
- When the user doesn't give numbers, estimate calories and macros yourself
  and mark the entry estimated. When they DO give numbers, theirs win,
  always, and the entry is not marked estimated.

Estimation honesty (this is what makes your estimates useful):
- Estimates are estimates. Use round numbers and say the rough range in your
  reply: "logged it — roughly 850–1,000 kcal, I wrote down 900."
- Typical home portions are your default assumption. Restaurant and takeout
  food runs larger and richer: estimate accordingly and widen the range.
- Ask at most ONE clarifying question, and only when the answer genuinely
  swings the estimate (a "bowl of rice" varying 3x matters; the brand of
  mustard does not). Otherwise assume and say what you assumed.
- Corrections are one sentence away: "that was a small one" → update the
  entry with update_meal. Never defend an estimate; revise it.
- Daily totals built on estimates are directional, not gospel — say so if
  the user starts treating ±20% numbers as precise.

Targets and the gentle read:
- Daily targets (calories, protein, carbs, fat) are optional and set in
  conversation via set_targets. Suggest evidence-aligned ballparks if asked,
  but the user's stated numbers are the targets.
- Surface honest patterns when summarizing: energy vs. workouts vs. meals
  vs. the day of week. Offer correlations gently, never as diagnosis, and
  only when the data actually shows them.
- Celebrate consistency of LOGGING itself — showing up to the hearth is the
  habit that makes everything else visible. Untracked days are just untracked,
  never a failure.

Lines you never cross:
- Never moralize about food. No "good" or "bad" foods, no guilt framing, no
  unprompted commentary on amounts. You keep records; you don't keep score.
- You are not a doctor or dietitian. For medical concerns, eating distress,
  or aggressive deficit requests, stay warm, decline to play clinician, and
  suggest a professional who can actually help.

Zero ceremony: bookkeeping is your job. The user never sees IDs, formats, or
mechanics.`

export function hestiaTools(): AgentTool[] {
  return [
    {
      name: 'log_meal',
      description: 'Log a meal. Provide calories and macros (protein_g/carbs_g/fat_g) — your estimate (estimated=1) unless the user supplied numbers (estimated=0). tags like "breakfast,snack" optional.',
      input_schema: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          calories: { type: 'integer' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          estimated: { type: 'integer', description: '1 if numbers are your estimate' },
          tags: { type: 'string' },
          eaten_at: { type: 'string', description: 'ISO datetime; defaults to now' }
        },
        required: ['description']
      },
      run: (i) => {
        const r = getDb().prepare(
          `INSERT INTO meals (description, calories, protein_g, carbs_g, fat_g, estimated, tags, eaten_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
        ).run(i.description, i.calories ?? null, i.protein_g ?? null, i.carbs_g ?? null, i.fat_g ?? null,
          i.estimated ?? 0, i.tags ?? '', i.eaten_at ?? null)
        return JSON.stringify({ id: r.lastInsertRowid })
      }
    },
    {
      name: 'update_meal',
      description: 'Revise a logged meal (corrections, better numbers). Provide only fields to change.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          description: { type: 'string' },
          calories: { type: 'integer' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          estimated: { type: 'integer' },
          tags: { type: 'string' }
        },
        required: ['id']
      },
      run: ({ id, ...patch }) => {
        const allowed = ['description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'estimated', 'tags']
        const keys = Object.keys(patch).filter((k) => allowed.includes(k))
        if (keys.length === 0) return 'Nothing to update'
        getDb().prepare(`UPDATE meals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
          .run(...keys.map((k) => (patch as any)[k]), id)
        return JSON.stringify({ ok: true })
      }
    },
    {
      name: 'delete_meal',
      description: 'Delete a meal entry. Only when the user explicitly asked.',
      input_schema: {
        type: 'object',
        properties: { id: { type: 'integer' } },
        required: ['id']
      },
      run: (i) => {
        getDb().prepare('DELETE FROM meals WHERE id = ?').run(i.id)
        return JSON.stringify({ ok: true })
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
        const days = Math.max(1, Math.min(90, i.days ?? 7))
        const db = getDb()
        const q = {
          meals: `SELECT id, eaten_at, description, calories, protein_g, carbs_g, fat_g, estimated, tags FROM meals WHERE eaten_at >= datetime('now', '-${days} days') ORDER BY eaten_at DESC`,
          workouts: `SELECT id, done_at, description, duration_min, intensity FROM workouts WHERE done_at >= datetime('now', '-${days} days') ORDER BY done_at DESC`,
          energy: `SELECT id, logged_at, energy, mood, note FROM energy_logs WHERE logged_at >= datetime('now', '-${days} days') ORDER BY logged_at DESC`
        }[i.kind as 'meals' | 'workouts' | 'energy']
        if (!q) return 'Unknown kind'
        return JSON.stringify(db.prepare(q).all())
      }
    },
    {
      name: 'nutrition_summary',
      description: 'Per-day calorie and macro totals for the last N days (default 7), plus current targets. Good for trends and daily check-ins.',
      input_schema: {
        type: 'object',
        properties: { days: { type: 'integer' } }
      },
      run: (i) => {
        const days = Math.max(1, Math.min(60, i?.days ?? 7))
        const db = getDb()
        const rows = db.prepare(
          `SELECT date(eaten_at, 'localtime') AS day,
                  SUM(calories) AS calories, SUM(protein_g) AS protein_g,
                  SUM(carbs_g) AS carbs_g, SUM(fat_g) AS fat_g,
                  COUNT(*) AS meals, MAX(estimated) AS any_estimated
           FROM meals WHERE eaten_at >= datetime('now', '-${days} days')
           GROUP BY day ORDER BY day DESC`
        ).all()
        const targets = db.prepare('SELECT calories, protein_g, carbs_g, fat_g FROM hestia_targets WHERE id = 1').get() ?? null
        return JSON.stringify({ days: rows, targets })
      }
    },
    {
      name: 'set_targets',
      description: "Set or update daily targets. Provide only what's changing; null clears a target.",
      input_schema: {
        type: 'object',
        properties: {
          calories: { type: ['integer', 'null'] },
          protein_g: { type: ['number', 'null'] },
          carbs_g: { type: ['number', 'null'] },
          fat_g: { type: ['number', 'null'] }
        }
      },
      run: (i) => {
        const db = getDb()
        const existing = db.prepare('SELECT * FROM hestia_targets WHERE id = 1').get() as any
        const next = {
          calories: i.calories !== undefined ? i.calories : existing?.calories ?? null,
          protein_g: i.protein_g !== undefined ? i.protein_g : existing?.protein_g ?? null,
          carbs_g: i.carbs_g !== undefined ? i.carbs_g : existing?.carbs_g ?? null,
          fat_g: i.fat_g !== undefined ? i.fat_g : existing?.fat_g ?? null
        }
        db.prepare(
          `INSERT INTO hestia_targets (id, calories, protein_g, carbs_g, fat_g, updated_at)
           VALUES (1, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET calories = ?, protein_g = ?, carbs_g = ?, fat_g = ?, updated_at = datetime('now')`
        ).run(next.calories, next.protein_g, next.carbs_g, next.fat_g,
          next.calories, next.protein_g, next.carbs_g, next.fat_g)
        return JSON.stringify({ ok: true, targets: next })
      }
    }
  ]
}
