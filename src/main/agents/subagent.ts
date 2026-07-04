import Anthropic from '@anthropic-ai/sdk'
import { AgentTool, ActivityListener, GodName } from './types'
import { recordUsage } from '../usage'

const MAX_TURNS = 8

/**
 * A domain god: one system prompt, one toolbox, one bounded tool-use loop.
 * Each consultation is stateless — the orchestrator carries conversation
 * memory; the god receives the query plus whatever context Zeus passes down.
 */
export class SubAgent {
  constructor(
    public god: GodName,
    private systemPrompt: string,
    private tools: AgentTool[],
    private client: Anthropic,
    private model: string,
    private onActivity?: ActivityListener
  ) {}

  async consult(query: string): Promise<string> {
    this.onActivity?.({ god: this.god, state: 'thinking' })
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: query }]
    const toolDefs = this.tools.map(({ name, description, input_schema }) => ({
      name, description, input_schema: input_schema as Anthropic.Tool.InputSchema
    }))

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: this.systemPrompt + `\n\nCurrent local datetime: ${new Date().toString()}`,
        tools: toolDefs,
        messages
      })
      recordUsage(this.model, this.god, response.usage)

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text).join('\n')
        this.onActivity?.({ god: this.god, state: 'done' })
        return text || '(no response)'
      }

      messages.push({ role: 'assistant', content: response.content })
      const results: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        const tool = this.tools.find((t) => t.name === block.name)
        this.onActivity?.({ god: this.god, state: 'tool', detail: block.name })
        let result: string
        try {
          result = tool ? String(await tool.run(block.input)) : `Unknown tool: ${block.name}`
        } catch (e: any) {
          result = `Tool error: ${e?.message ?? String(e)}`
        }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }
      messages.push({ role: 'user', content: results })
    }
    this.onActivity?.({ god: this.god, state: 'done' })
    return 'I ran out of tool turns before finishing. Partial work may have been done — ask me to verify.'
  }
}
