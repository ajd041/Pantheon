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

export interface HabitOverview {
  id: number
  name: string
  cadence: string
  target_per_week: number
  minutes_per_session: number
  why: string
  streak: number
  week_count: number
  logged_today: boolean
  last7: string[]
}

export interface GoalOverview {
  id: number
  title: string
  why: string
  target_amount: number | null
  unit: string
  status: string
  target_date: string | null
  progress_total: number
}

export interface MealRow {
  id: number
  eaten_at: string
  description: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  estimated: number
}

export interface HestiaOverview {
  meals: MealRow[]
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number; any_estimated: boolean }
  targets: { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null } | null
  workouts: { id: number; done_at: string; description: string; duration_min: number | null; intensity: string }[]
  energy: { energy: number; mood: string; logged_at: string } | null
}

export interface UsageBucket {
  calls: number
  input_tokens: number
  output_tokens: number
  est_cost: number
}

declare global {
  interface Window {
    pantheon: {
      send(message: string): Promise<{ text: string; agents: GodName[] }>
      history(): Promise<ChatMessage[]>
      getSettings(): Promise<Settings>
      setSettings(s: Partial<Settings>): Promise<{ ok: boolean }>
      pickVault(): Promise<string | null>
      usageSummary(): Promise<{ today: UsageBucket; month: UsageBucket }>
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
      hermesChat(message: string): Promise<{ text: string }>
      hermesChatHistory(): Promise<{ role: 'user' | 'assistant'; content: string }[]>
      hermesOverview(): Promise<{ habits: HabitOverview[]; goals: GoalOverview[] }>
      hermesLogHabit(habitId: number): Promise<{ ok: boolean }>
      hermesLogGoal(goalId: number, amount: number, note: string): Promise<{ ok: boolean }>
      hestiaChat(message: string): Promise<{ text: string }>
      hestiaChatHistory(): Promise<{ role: 'user' | 'assistant'; content: string }[]>
      hestiaOverview(): Promise<HestiaOverview>
      hestiaLogEnergy(level: number): Promise<{ ok: boolean }>
      apolloChat(message: string): Promise<{ text: string }>
      apolloChatHistory(): Promise<{ role: 'user' | 'assistant'; content: string }[]>
      apolloListNotes(): Promise<{ notes: string[]; root: string; error?: string }>
      apolloReadNote(rel: string): Promise<{ content: string; error?: string }>
      onActivity(cb: (e: ActivityEvent) => void): () => void
    }
  }
}

export const api = () => window.pantheon
