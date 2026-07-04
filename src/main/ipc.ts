import { ipcMain, BrowserWindow, dialog } from 'electron'
import { Orchestrator } from './agents/orchestrator'
import { GodChat } from './agents/godChat'
import { CHRONOS_PROMPT, chronosTools } from './agents/chronos'
import { APOLLO_PROMPT, apolloTools, vaultPath } from './agents/apollo'
import { HERMES_PROMPT, hermesTools, computeStreak } from './agents/hermes'
import { HESTIA_PROMPT, hestiaTools } from './agents/hestia'
import * as vault from './integrations/obsidian'
import { loadSettings, saveSettings } from './settings'
import { getDb } from './db'
import * as gcal from './integrations/googleCalendar'
import { usageSummary } from './usage'

let orchestrator: Orchestrator | null = null
let chronosChat: GodChat | null = null
let apolloChat: GodChat | null = null
let hermesChat: GodChat | null = null
let hestiaChat: GodChat | null = null

export function registerIpc(win: BrowserWindow): void {
  const emitActivity = (e: unknown) => win.webContents.send('pantheon:activity', e)

  ipcMain.handle('chat:send', async (_evt, message: string) => {
    if (!orchestrator) orchestrator = new Orchestrator(emitActivity)
    return orchestrator.send(message)
  })

  ipcMain.handle('chat:history', () => {
    return getDb().prepare(
      "SELECT role, content, agents, created_at FROM messages WHERE channel = 'zeus' ORDER BY id ASC LIMIT 200"
    ).all()
  })

  ipcMain.handle('settings:get', () => {
    const s = loadSettings()
    // Don't ship the full key back to the renderer; just whether it exists.
    return { ...s, anthropicApiKey: s.anthropicApiKey ? '••••' + s.anthropicApiKey.slice(-4) : '' }
  })

  ipcMain.handle('settings:set', (_evt, next: Record<string, string>) => {
    // Ignore the masked placeholder if the user didn't retype the key.
    if (next.anthropicApiKey?.startsWith('••••')) delete next.anthropicApiKey
    saveSettings(next)
    orchestrator = null // rebuild with fresh settings next message
    chronosChat = null
    apolloChat = null
    hermesChat = null
    hestiaChat = null
    return { ok: true }
  })

  ipcMain.handle('settings:pickVault', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    saveSettings({ vaultPath: res.filePaths[0] })
    return res.filePaths[0]
  })

  // ── Chronos board: direct data access (no LLM round-trip) ──
  const mondayKey = (): string => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  ipcMain.handle('chronos:tasks', () => {
    const db = getDb()
    const rows = db.prepare(
      `SELECT id, title, notes, due, quadrant, expected_minutes, actual_minutes, scheduled_start, category, done, completed_at
       FROM tasks WHERE done = 0 OR date(completed_at, 'localtime') >= ?
       ORDER BY done, COALESCE(scheduled_start, due, '9999'), quadrant`
    ).all(mondayKey()) as any[]
    const subStmt = db.prepare('SELECT id, task_id, title, done FROM subtasks WHERE task_id = ? ORDER BY position, id')
    for (const r of rows) r.subtasks = subStmt.all(r.id)
    return rows
  })

  ipcMain.handle('chronos:archive', () => {
    const db = getDb()
    const rows = db.prepare(
      `SELECT id, title, expected_minutes, actual_minutes, category, completed_at
       FROM tasks WHERE done = 1 AND date(completed_at, 'localtime') < ?
       ORDER BY completed_at DESC LIMIT 300`
    ).all(mondayKey()) as any[]
    return rows
  })

  ipcMain.handle('chronos:chat', async (_evt, message: string) => {
    if (!chronosChat) chronosChat = new GodChat('chronos', CHRONOS_PROMPT, chronosTools, emitActivity)
    return chronosChat.send(message)
  })

  ipcMain.handle('hermes:chat', async (_evt, message: string) => {
    if (!hermesChat) hermesChat = new GodChat('hermes', HERMES_PROMPT, hermesTools, emitActivity)
    return hermesChat.send(message)
  })

  ipcMain.handle('hermes:chatHistory', () => {
    return getDb().prepare(
      "SELECT role, content FROM messages WHERE channel = 'hermes' ORDER BY id ASC LIMIT 100"
    ).all()
  })

  ipcMain.handle('hermes:overview', () => {
    const db = getDb()
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
    const habits = (db.prepare(
      'SELECT id, name, cadence, target_per_week, minutes_per_session, why FROM habits WHERE archived = 0'
    ).all() as any[]).map((h) => {
      const { streak, dates } = computeStreak(db, h.id)
      const last7: string[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
        if (dates.has(d)) last7.push(d)
      }
      return { ...h, streak, week_count: [...dates].filter((d) => d >= weekAgo).length, logged_today: dates.has(today), last7 }
    })
    const goals = db.prepare(
      `SELECT g.id, g.title, g.why, g.target_amount, g.unit, g.status, g.target_date,
              COALESCE((SELECT SUM(amount) FROM goal_logs WHERE goal_id = g.id), 0) AS progress_total
       FROM goals g WHERE g.status = 'active' ORDER BY g.created_at`
    ).all()
    return { habits, goals }
  })

  ipcMain.handle('hermes:logHabit', (_evt, habitId: number) => {
    getDb().prepare(
      'INSERT OR IGNORE INTO habit_logs (habit_id, logged_on) VALUES (?, ?)'
    ).run(habitId, new Date().toISOString().slice(0, 10))
    return { ok: true }
  })

  ipcMain.handle('hermes:logGoal', (_evt, goalId: number, amount: number, note: string) => {
    getDb().prepare('INSERT INTO goal_logs (goal_id, amount, note) VALUES (?, ?, ?)').run(goalId, amount, note ?? '')
    return { ok: true }
  })

  ipcMain.handle('hestia:chat', async (_evt, message: string) => {
    if (!hestiaChat) hestiaChat = new GodChat('hestia', HESTIA_PROMPT, hestiaTools, emitActivity)
    return hestiaChat.send(message)
  })

  ipcMain.handle('hestia:chatHistory', () => {
    return getDb().prepare(
      "SELECT role, content FROM messages WHERE channel = 'hestia' ORDER BY id ASC LIMIT 100"
    ).all()
  })

  ipcMain.handle('hestia:overview', () => {
    const db = getDb()
    const meals = db.prepare(
      `SELECT id, eaten_at, description, calories, protein_g, carbs_g, fat_g, estimated
       FROM meals WHERE date(eaten_at, 'localtime') = date('now', 'localtime') ORDER BY eaten_at`
    ).all() as any[]
    const totals = {
      calories: meals.reduce((a, m) => a + (m.calories ?? 0), 0),
      protein_g: meals.reduce((a, m) => a + (m.protein_g ?? 0), 0),
      carbs_g: meals.reduce((a, m) => a + (m.carbs_g ?? 0), 0),
      fat_g: meals.reduce((a, m) => a + (m.fat_g ?? 0), 0),
      any_estimated: meals.some((m) => m.estimated)
    }
    const targets = db.prepare('SELECT calories, protein_g, carbs_g, fat_g FROM hestia_targets WHERE id = 1').get() ?? null
    const workouts = db.prepare(
      `SELECT id, done_at, description, duration_min, intensity
       FROM workouts WHERE date(done_at, 'localtime') = date('now', 'localtime') ORDER BY done_at`
    ).all()
    const energy = db.prepare(
      `SELECT energy, mood, logged_at FROM energy_logs
       WHERE date(logged_at, 'localtime') = date('now', 'localtime') ORDER BY logged_at DESC LIMIT 1`
    ).get() ?? null
    return { meals, totals, targets, workouts, energy }
  })

  ipcMain.handle('hestia:logEnergy', (_evt, level: number) => {
    getDb().prepare('INSERT INTO energy_logs (energy) VALUES (?)').run(level)
    return { ok: true }
  })

  ipcMain.handle('apollo:chat', async (_evt, message: string) => {
    if (!apolloChat) apolloChat = new GodChat('apollo', APOLLO_PROMPT, apolloTools, emitActivity)
    return apolloChat.send(message)
  })

  ipcMain.handle('apollo:chatHistory', () => {
    return getDb().prepare(
      "SELECT role, content FROM messages WHERE channel = 'apollo' ORDER BY id ASC LIMIT 100"
    ).all()
  })

  ipcMain.handle('apollo:listNotes', () => {
    try {
      const root = vaultPath()
      return { notes: vault.listNotes(root), root }
    } catch (e: any) {
      return { notes: [], root: '', error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('apollo:readNote', (_evt, rel: string) => {
    try {
      return { content: vault.readNote(vaultPath(), rel) }
    } catch (e: any) {
      return { content: '', error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('chronos:chatHistory', () => {
    return getDb().prepare(
      "SELECT role, content FROM messages WHERE channel = 'chronos' ORDER BY id ASC LIMIT 100"
    ).all()
  })

  ipcMain.handle('chronos:deleteTask', (_evt, id: number) => {
    const db = getDb()
    db.prepare('DELETE FROM subtasks WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('chronos:addSubtask', (_evt, taskId: number, title: string) => {
    const r = getDb().prepare('INSERT INTO subtasks (task_id, title, position) VALUES (?, ?, 1000)').run(taskId, title)
    return { id: Number(r.lastInsertRowid) }
  })

  ipcMain.handle('chronos:toggleSubtask', (_evt, id: number, done: number) => {
    getDb().prepare('UPDATE subtasks SET done = ? WHERE id = ?').run(done, id)
    return { ok: true }
  })

  ipcMain.handle('chronos:deleteSubtask', (_evt, id: number) => {
    getDb().prepare('DELETE FROM subtasks WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('chronos:addTask', (_evt, t: { title: string; expected_minutes?: number; quadrant?: number; due?: string }) => {
    const r = getDb().prepare(
      'INSERT INTO tasks (title, expected_minutes, quadrant, due) VALUES (?, ?, ?, ?)'
    ).run(t.title, t.expected_minutes ?? 30, t.quadrant ?? 2, t.due ?? null)
    return { id: Number(r.lastInsertRowid) }
  })

  ipcMain.handle('chronos:updateTask', (_evt, id: number, patch: Record<string, unknown>) => {
    const allowed = ['title', 'notes', 'due', 'quadrant', 'expected_minutes', 'actual_minutes', 'scheduled_start', 'category', 'done']
    const keys = Object.keys(patch).filter((k) => allowed.includes(k))
    if (keys.length === 0) return { ok: false }
    const sets = keys.map((k) => `${k} = ?`).join(', ')
    const extra = keys.includes('done') && patch.done ? ", completed_at = datetime('now')" : ''
    getDb().prepare(`UPDATE tasks SET ${sets}${extra} WHERE id = ?`).run(...keys.map((k) => patch[k] as any), id)
    return { ok: true }
  })

  ipcMain.handle('chronos:events', async (_evt, timeMin: string, timeMax: string) => {
    try {
      return { events: await gcal.listEvents(timeMin, timeMax) }
    } catch (e: any) {
      return { events: [], error: e?.message ?? String(e) }
    }
  })

  ipcMain.handle('usage:summary', () => usageSummary())

  ipcMain.handle('google:status', () => ({ connected: gcal.isConnected() }))

  ipcMain.handle('google:connect', async () => {
    await gcal.connect()
    return { connected: true }
  })
}
