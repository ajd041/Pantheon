import fs from 'node:fs'
import path from 'node:path'

/** All vault access funnels through here. Paths are confined to the vault root. */

function resolveInVault(vault: string, rel: string): string {
  const full = path.resolve(vault, rel)
  if (!full.startsWith(path.resolve(vault) + path.sep) && full !== path.resolve(vault)) {
    throw new Error('Path escapes the vault')
  }
  return full
}

export function listNotes(vault: string, dir = '.'): string[] {
  const root = resolveInVault(vault, dir)
  const out: string[] = []
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.md')) out.push(path.relative(vault, full))
    }
  }
  walk(root)
  return out
}

export function readNote(vault: string, rel: string): string {
  return fs.readFileSync(resolveInVault(vault, rel), 'utf-8')
}

export function writeNote(vault: string, rel: string, content: string): void {
  const full = resolveInVault(vault, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

export function appendToNote(vault: string, rel: string, content: string): void {
  const full = resolveInVault(vault, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.appendFileSync(full, '\n' + content, 'utf-8')
}

export interface SearchHit { file: string; line: number; text: string }

export function searchVault(vault: string, query: string, maxHits = 30): SearchHit[] {
  const needle = query.toLowerCase()
  const hits: SearchHit[] = []
  for (const rel of listNotes(vault)) {
    const lines = readNote(vault, rel).split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        hits.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) })
        if (hits.length >= maxHits) return hits
      }
    }
  }
  return hits
}
