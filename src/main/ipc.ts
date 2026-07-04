import { ipcMain, BrowserWindow, dialog } from 'electron'
import { Orchestrator } from './agents/orchestrator'
import { ChronosChat } from './agents/chronosChat'
import { loadSettings, saveSettings } from './settings'
import { getDb } from './db'
import * as gcal from './integrations/googleCalendar'

let orchestrator: Orchestrator | null = null
let chronosChat: ChronosChat | null = null

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
    if (!chronosChat) chronosChat = new ChronosChat(emitActivity)
    return chronosChat.send(message)
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

  ipcMain.handle('google:status', () => ({ connected: gcal.isConnected() }))

  ipcMain.handle('google:connect', async () => {
    await gcal.connect()
    return { connected: true }
  })
}
