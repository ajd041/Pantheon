import Anthropic from '@anthropic-ai/sdk'
import { CHRONOS_PROMPT, chronosTools } from './chronos'
import { ActivityListener } from './types'
import { loadSettings } from '../settings'
import { getDb } from '../db'

const MAX_TURNS = 8
const HISTORY_LIMIT = 24

const DIRECT_NOTE = `

Direct line: the user is speaking to you directly from your planning board,
not through Zeus. Reply to them in your own voice — a warm, brief, capable
assistant. Confirm actions in passing, in one or two sentences. The board
refreshes automatically after you act, so never describe UI mechanics or tell
the user where to look.`

/**
 * Chronos's own chat: same prompt and toolbox as his subagent persona, but
 * stateful, persisted on its own message channel, and addressed to the user.
 */
export class ChronosChat {
  private history: Anthropic.MessageParam[] = []

  constructor(private onActivity?: ActivityListener) {
    const rows = getDb().prepare(
      `SELECT role, content FROM messages WHERE channel = 'chronos' ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`
    ).all() as { role: 'user' | 'assistant'; content: string }[]
    this.history = rows.reverse().map((r) => ({ role: r.role, content: r.content }))
  }

  async send(userMessage: string): Promise<{ text: string }> {
    const settings = loadSettings()
    if (!settings.anthropicApiKey) {
      return { text: 'I need an Anthropic API key first — open Settings (gear icon on the Zeus page) and add one.' }
    }
    const client = new Anthropic({ apiKey: settings.anthropicApiKey })
    const tools = chronosTools()
    const toolDefs = tools.map(({ name, description, input_schema }) => ({
      name, description, input_schema: input_schema as Anthropic.Tool.InputSchema
    }))

    const db = getDb()
    this.history.push({ role: 'user', content: userMessage })
    db.prepare("INSERT INTO messages (role, content, channel) VALUES (?, ?, 'chronos')").run('user', userMessage)

    let finalText = ''
    this.onActivity?.({ god: 'chronos', state: 'thinking' })

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: settings.model,
        max_tokens: 2000,
        system: CHRONOS_PROMPT + DIRECT_NOTE + `\n\nCurrent local datetime: ${new Date().toString()}`,
        tools: toolDefs,
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
        const tool = tools.find((t) => t.name === block.name)
        this.onActivity?.({ god: 'chronos', state: 'tool', detail: block.name })
        let result: string
        try {
          result = tool ? String(await tool.run(block.input)) : `Unknown tool: ${block.name}`
        } catch (e: any) {
          result = `Tool error: ${e?.message ?? String(e)}`
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      this.history.push({ role: 'user', content: results })
    }

    if (!finalText) finalText = 'That ran long — some steps may have completed. Ask me to verify.'
    db.prepare("INSERT INTO messages (role, content, channel) VALUES (?, ?, 'chronos')").run('assistant', finalText)

    if (this.history.length > HISTORY_LIMIT * 2) {
      this.history = this.history.filter((m) => typeof m.content === 'string').slice(-HISTORY_LIMIT)
    }
    this.onActivity?.({ god: 'chronos', state: 'done' })
    return { text: finalText }
  }
}
