export type GodName = 'zeus' | 'chronos' | 'hermes' | 'apollo' | 'hestia'

export interface ActivityEvent {
  god: GodName
  state: 'thinking' | 'tool' | 'done'
  detail?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  agents?: string
}

export interface Settings {
  anthropicApiKey: string
  model: string
  vaultPath: string
  googleClientId: string
  googleClientSecret: string
  userName: string
}

export interface Subtask {
  id: number
  task_id: number
  title: string
  done: number
}

export interface Task {
  id: number
  title: string
  notes: string
  due: string | null
  quadrant: 1 | 2 | 3 | 4
  expected_minutes: number
  actual_minutes: number
  scheduled_start: string | null
  category: string
  done: number
  completed_at?: string | null
  subtasks: Subtask[]
}

export interface CalEvent {
  id: string
  summary: string
  start: string
  end: string
  location?: string
}

declare global {
  interface Window {
    pantheon: {
      send(message: string): Promise<{ text: string; agents: GodName[] }>
      history(): Promise<ChatMessage[]>
      getSettings(): Promise<Settings>
      setSettings(s: Partial<Settings>): Promise<{ ok: boolean }>
      pickVault(): Promise<string | null>
      googleStatus(): Promise<{ connected: boolean }>
      googleConnect(): Promise<{ connected: boolean }>
      chronosTasks(): Promise<Task[]>
      chronosAddTask(t: Partial<Task> & { title: string }): Promise<{ id: number }>
      chronosUpdateTask(id: number, patch: Partial<Task>): Promise<{ ok: boolean }>
      chronosEvents(timeMin: string, timeMax: string): Promise<{ events: CalEvent[]; error?: string }>
      chronosArchive(): Promise<Pick<Task, 'id' | 'title' | 'expected_minutes' | 'actual_minutes' | 'category' | 'completed_at'>[]>
      chronosChat(message: string): Promise<{ text: string }>
      chronosChatHistory(): Promise<{ role: 'user' | 'assistant'; content: string }[]>
      chronosDeleteTask(id: number): Promise<{ ok: boolean }>
      chronosAddSubtask(taskId: number, title: string): Promise<{ id: number }>
      chronosToggleSubtask(id: number, done: number): Promise<{ ok: boolean }>
      chronosDeleteSubtask(id: number): Promise<{ ok: boolean }>
      onActivity(cb: (e: ActivityEvent) => void): () => void
    }
  }
}

export const api = () => window.pantheon
