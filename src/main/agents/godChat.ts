import Anthropic from '@anthropic-ai/sdk'
import { AgentTool, ActivityListener, GodName } from './types'
import { loadSettings } from '../settings'
import { getDb } from '../db'
import { recordUsage } from '../usage'

const MAX_TURNS = 8
const HISTORY_LIMIT = 24

/**
 * A god's direct chat line: same prompt and toolbox as their subagent
 * persona, but stateful, persisted on their own message channel, and
 * addressed to the user rather than to Zeus.
 */
export class GodChat {
  private history: Anthropic.MessageParam[] = []

  constructor(
    private god: GodName,
    private systemPrompt: string,
    private toolsFactory: () => AgentTool[],
    private onActivity?: ActivityListener
  ) {
    const rows = getDb().prepare(
      `SELECT role, content FROM messages WHERE channel = ? ORDER BY id DESC LIMIT ${HISTORY_LIMIT}`
    ).all(god) as { role: 'user' | 'assistant'; content: string }[]
    this.history = rows.reverse().map((r) => ({ role: r.role, content: r.content }))
  }

  private directNote(): string {
    return `

Direct line: the user is speaking to you directly from your page, not through
Zeus. Reply to them in your own voice — a warm, brief, capable companion.
Confirm actions in passing, in one or two sentences. The page refreshes
automatically after you act, so never describe UI mechanics or tell the user
where to look.`
  }

  async send(userMessage: string): Promise<{ text: string }> {
    const settings = loadSettings()
    if (!settings.anthropicApiKey) {
      return { text: 'I need an Anthropic API key first — open Settings (gear icon on the Zeus page) and add one.' }
    }
    const client = new Anthropic({ apiKey: settings.anthropicApiKey })
    const tools = this.toolsFactory()
    const toolDefs = tools.map(({ name, description, input_schema }) => ({
      name, description, input_schema: input_schema as Anthropic.Tool.InputSchema
    }))

    const db = getDb()
    this.history.push({ role: 'user', content: userMessage })
    db.prepare('INSERT INTO messages (role, content, channel) VALUES (?, ?, ?)').run('user', userMessage, this.god)

    let finalText = ''
    this.onActivity?.({ god: this.god, state: 'thinking' })

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: settings.model,
        max_tokens: 2500,
        system: this.systemPrompt + this.directNote() + `\n\nCurrent local datetime: ${new Date().toString()}`,
        tools: toolDefs,
        messages: this.history
      })
      recordUsage(settings.model, this.god, response.usage)

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
        this.onActivity?.({ god: this.god, state: 'tool', detail: block.name })
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
    db.prepare('INSERT INTO messages (role, content, channel) VALUES (?, ?, ?)').run('assistant', finalText, this.god)

    if (this.history.length > HISTORY_LIMIT * 2) {
      this.history = this.history.filter((m) => typeof m.content === 'string').slice(-HISTORY_LIMIT)
    }
    this.onActivity?.({ god: this.god, state: 'done' })
    return { text: finalText }
  }
}
