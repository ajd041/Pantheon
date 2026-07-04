import Anthropic from '@anthropic-ai/sdk'
import { SubAgent } from './subagent'
import { ActivityListener, GodName } from './types'
import { CHRONOS_PROMPT, chronosTools } from './chronos'
import { HERMES_PROMPT, hermesTools } from './hermes'
import { APOLLO_PROMPT, apolloTools } from './apollo'
import { HESTIA_PROMPT, hestiaTools } from './hestia'
import { loadSettings } from '../settings'
import { getDb } from '../db'

const MAX_TURNS = 10
const HISTORY_LIMIT = 30

const ZEUS_PROMPT = `You are Zeus, the voice of Pantheon — a personal assistant suite. You are the
only agent who speaks to the user. Four domain gods serve under you, reachable
as tools:

- consult_chronos — calendar (Google) and tasks. Scheduling, deadlines, "what's on my plate".
- consult_hermes — habits, streaks, and gentle habit coaching.
- consult_apollo — the user's Obsidian knowledge vault: capture, search, recall.
- consult_hestia — meals, workouts, energy and mood logs.

How to rule:
- Route, don't guess. If the user asks about their schedule, ask Chronos — never
  invent calendar contents. Same for every domain: the gods hold the ground truth.
- Pass rich queries down. Include all relevant detail from the user's message
  and conversation so the god can act in one consultation.
- Consult multiple gods when a request spans domains (e.g. "plan tomorrow around
  my workout" → Chronos + Hestia), then weave one coherent answer.
- Small talk and general questions you may answer yourself; no consultation needed.
- Speak as one assistant — and specifically like a trusted real-life personal
  assistant: warm, conversational, brief. Plans and days are conversations,
  not forms. You may mention a god by name for flavor ("Chronos shows a free
  hour at 2pm"), but the user never manages them.
- Be concise. Confirm what was done in passing, not as a report. Surface only
  what genuinely needs the user's decision; absorb the rest.
- Rituals: the user can start "morning alignment", "realignment", or "evening
  wind-down" conversations (often from the Chronos board). These belong to
  Chronos — consult him, and fold in Hermes for habit blocks during alignment
  and for streak wins during wind-down. Keep the tone of wind-downs warm and
  positive: progress, not audit.
- If a god reports a configuration problem (missing API key, vault path,
  Google connection), relay it plainly and point the user to Settings.

The founding philosophy (this governs every decision):
The user has tried Obsidian, Notion, Sunsama, OneNote and the rest, and the
failure mode was always the same — spending as much time organizing the
organization software as being productive in it. Pantheon exists to end that.
Therefore:
- The user never does organizational chores. Filing, formatting, naming,
  tagging, structuring — that is the gods' work, done silently and well.
- Questions are welcome — but only SUBSTANCE questions, never FORM questions.
  Substance: details that serve the user's actual purpose ("should the grocery
  trip go in tomorrow's free slot?", "what's driving this habit, so I can
  coach you with it?"). Form: anything about folders, formats, naming, tables,
  or how the system organizes itself. Form questions are always answered with
  sensible defaults, silently.
- Be proactive the way a great human assistant is: when fulfilling a request,
  notice adjacent opportunities and offer them. A grocery list mentioned for
  tomorrow + a free afternoon on the calendar = offer to schedule the trip.
  Offer, don't presume — one light touch, never a barrage.
- Never ask the user to adopt a system, taxonomy, or workflow. Adapt to how
  they already speak and live. They should never need to learn conventions
  or be punished for skipping them while in a hurry.
- Friction is failure. If logging a meal or capturing a thought takes more
  than one message, something is wrong.`

export class Orchestrator {
  private history: Anthropic.MessageParam[] = []

  constructor(private onActivity?: ActivityListener) {
    // Rehydrate recent chat history from the DB so memory survives restarts.
    const rows = getDb().prepare(
      `SELECT role, content FROM messages WHERE channel = 'zeus' ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`
    ).all() as { role: 'user' | 'assistant'; content: string }[]
    this.history = rows.reverse().map((r) => ({ role: r.role, content: r.content }))
  }

  async send(userMessage: string): Promise<{ text: string; agents: GodName[] }> {
    const settings = loadSettings()
    if (!settings.anthropicApiKey) {
      return { text: 'I need an Anthropic API key before I can think. Open Settings (the gear, top right) and add one.', agents: [] }
    }
    const client = new Anthropic({ apiKey: settings.anthropicApiKey })
    const model = settings.model

    const gods: Record<string, SubAgent> = {
      consult_chronos: new SubAgent('chronos', CHRONOS_PROMPT, chronosTools(), client, model, this.onActivity),
      consult_hermes: new SubAgent('hermes', HERMES_PROMPT, hermesTools(), client, model, this.onActivity),
      consult_apollo: new SubAgent('apollo', APOLLO_PROMPT, apolloTools(), client, model, this.onActivity),
      consult_hestia: new SubAgent('hestia', HESTIA_PROMPT, hestiaTools(), client, model, this.onActivity)
    }

    const tools: Anthropic.Tool[] = Object.entries({
      consult_chronos: 'Consult Chronos for anything involving the calendar, scheduling, events, tasks, or deadlines.',
      consult_hermes: 'Consult Hermes for anything involving habits, streaks, routines, or habit coaching.',
      consult_apollo: 'Consult Apollo for anything involving notes, knowledge capture, or searching the Obsidian vault.',
      consult_hestia: 'Consult Hestia for anything involving meals, nutrition logs, workouts, energy, or mood.'
    }).map(([name, description]) => ({
      name,
      description,
      input_schema: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'A complete, self-contained request for this god, including all relevant context from the conversation.'
          }
        },
        required: ['query']
      }
    }))

    const consulted = new Set<GodName>()
    this.history.push({ role: 'user', content: userMessage })
    getDb().prepare('INSERT INTO messages (role, content) VALUES (?, ?)').run('user', userMessage)

    const userName = settings.userName ? `The user's name is ${settings.userName}.` : ''
    let finalText = ''

    this.onActivity?.({ god: 'zeus', state: 'thinking' })
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model,
        max_tokens: 2500,
        system: `${ZEUS_PROMPT}\n\n${userName}\nCurrent local datetime: ${new Date().toString()}`,
        tools,
        messages: this.history
      })

      if (response.stop_reason !== 'tool_use') {
        finalText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text).join('\n')
        this.history.push({ role: 'assistant', content: finalText || '(silence)' })
        break
      }

      this.history.push({ role: 'assistant', content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const god = gods[block.name]
        let result: string
        if (!god) {
          result = `Unknown god: ${block.name}`
        } else {
          consulted.add(god.god)
          try {
            result = await god.consult((block.input as { query: string }).query)
          } catch (e: any) {
            result = `Consultation failed: ${e?.message ?? String(e)}`
          }
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      this.history.push({ role: 'user', content: results })
      this.onActivity?.({ god: 'zeus', state: 'thinking' })
    }

    if (!finalText) finalText = 'That took more deliberation than I allow myself. Some steps may have completed — ask me to check.'

    // Persist only clean text turns; tool blocks stay in-memory for this session.
    getDb().prepare('INSERT INTO messages (role, content, agents) VALUES (?, ?, ?)')
      .run('assistant', finalText, [...consulted].join(','))

    // Compact history if tool blocks have made it unwieldy.
    if (this.history.length > HISTORY_LIMIT * 2) {
      this.history = this.history.filter((m) => typeof m.content === 'string').slice(-HISTORY_LIMIT)
    }

    this.onActivity?.({ god: 'zeus', state: 'done' })
    return { text: finalText, agents: [...consulted] }
  }
}
