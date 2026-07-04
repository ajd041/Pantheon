import { getDb } from './db'

/**
 * Approximate USD prices per MILLION tokens [input, output].
 * Edit here if Anthropic's pricing changes — the meter is an estimate,
 * and the Console's usage page is always the source of truth.
 */
const PRICES: [string, [number, number]][] = [
  ['opus', [15, 75]],
  ['sonnet', [3, 15]],
  ['haiku', [1, 5]]
]

function priceFor(model: string): [number, number] {
  for (const [needle, p] of PRICES) if (model.includes(needle)) return p
  return [3, 15]
}

export function recordUsage(model: string, god: string, usage?: { input_tokens?: number; output_tokens?: number } | null): void {
  try {
    if (!usage) return
    getDb().prepare(
      'INSERT INTO api_usage (model, god, input_tokens, output_tokens) VALUES (?, ?, ?, ?)'
    ).run(model, god, usage.input_tokens ?? 0, usage.output_tokens ?? 0)
  } catch { /* metering must never break the app */ }
}

interface Bucket { calls: number; input_tokens: number; output_tokens: number; est_cost: number }

function summarize(where: string): Bucket {
  const rows = getDb().prepare(
    `SELECT model, COUNT(*) AS calls, SUM(input_tokens) AS inp, SUM(output_tokens) AS out
     FROM api_usage WHERE ${where} GROUP BY model`
  ).all() as { model: string; calls: number; inp: number; out: number }[]
  const b: Bucket = { calls: 0, input_tokens: 0, output_tokens: 0, est_cost: 0 }
  for (const r of rows) {
    const [pi, po] = priceFor(r.model)
    b.calls += r.calls
    b.input_tokens += r.inp ?? 0
    b.output_tokens += r.out ?? 0
    b.est_cost += ((r.inp ?? 0) / 1e6) * pi + ((r.out ?? 0) / 1e6) * po
  }
  return b
}

export function usageSummary(): { today: Bucket; month: Bucket } {
  return {
    today: summarize("date(created_at, 'localtime') = date('now', 'localtime')"),
    month: summarize("strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')")
  }
}
