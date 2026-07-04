import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface Settings {
  anthropicApiKey: string
  model: string
  vaultPath: string
  googleClientId: string
  googleClientSecret: string
  userName: string
}

const DEFAULTS: Settings = {
  anthropicApiKey: '',
  model: 'claude-sonnet-4-6',
  vaultPath: '',
  googleClientId: '',
  googleClientSecret: '',
  userName: ''
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): Settings {
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf-8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(next: Partial<Settings>): Settings {
  const merged = { ...loadSettings(), ...next }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
