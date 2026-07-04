export interface AgentTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  /** Execute the tool; return a string the model will read. Throwing is fine — errors are reported back to the model. */
  run: (input: any) => Promise<string> | string
}

export type GodName = 'zeus' | 'chronos' | 'hermes' | 'apollo' | 'hestia'

export interface ActivityEvent {
  god: GodName
  state: 'thinking' | 'tool' | 'done'
  detail?: string
}

export type ActivityListener = (e: ActivityEvent) => void
