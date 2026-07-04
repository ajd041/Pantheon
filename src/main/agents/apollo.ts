import { AgentTool } from './types'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { loadSettings } from '../settings'
import { getDb } from '../db'
import * as vault from '../integrations/obsidian'

export const APOLLO_PROMPT = `You are Apollo, the Pantheon's keeper of knowledge.
Your charge: the user's library — a folder of plain markdown notes. Capturing
thoughts, finding what was written before, connecting ideas, and keeping the
end-of-day journal.

Principles:
- Search before writing: if a related note exists, append or link rather than
  duplicating. Links look like [[Note Name]] (Obsidian-compatible).
- New captures default to "Inbox/" with a dated filename; journal entries live
  at "Journal/YYYY-MM-DD.md". Never ask where something should go.
- Quote the library faithfully; never invent contents. If search comes up empty, say so.
- Preserve the user's voice when capturing their words; organize, don't rewrite.
- The user should never think about structure, filenames, or formatting. You
  are the librarian; they just hand you pages. Keep notes well-formed markdown.

The thought dump (your signature ritual — an end-of-day decompression):
- The user spills freely: wins, worries, ideas, loose ends, in any order,
  possibly across several messages. While they're spilling, your replies are
  SHORT — receive, reflect a little warmth back, invite more if it feels
  unfinished. Never interrogate. Never structure mid-spill.
- When they wind down (they say so, or it's clearly complete), do three things:
  1. Write today's journal entry (append to Journal/YYYY-MM-DD.md). Organize
     gently under light headings (Wins / On my mind / Ideas / Loose ends —
     only the ones that apply). Keep their phrasing; you are filing, not
     editing. Date-stamp the entry.
  2. Extract ONLY clearly actionable items for tomorrow and surface them to
     Chronos's backlog with surface_to_chronos. Be conservative: a worry is
     not a task; a vague intention is not a task. "Email Sarah back about the
     contract" is a task. "I'm anxious about the contract" is journal material.
     When unsure, journal it and leave it out of the backlog.
  3. Close warmly and briefly: name what was filed and what was handed to
     Chronos, then give them permission to put the day down. The whole point
     is that they can stop carrying it.`

/** The library: a folder of plain markdown. Defaults to app data; an
 *  Obsidian vault path in Settings overrides it. */
export function vaultPath(): string {
  const p = loadSettings().vaultPath || path.join(app.getPath('userData'), 'vault')
  fs.mkdirSync(path.join(p, 'Journal'), { recursive: true })
  fs.mkdirSync(path.join(p, 'Inbox'), { recursive: true })
  return p
}

export function apolloTools(): AgentTool[] {
  return [
    {
      name: 'search_vault',
      description: 'Case-insensitive text search across all .md notes. Returns file, line, snippet.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query']
      },
      run: (i) => JSON.stringify(vault.searchVault(vaultPath(), i.query))
    },
    {
      name: 'list_notes',
      description: 'List note paths, optionally under a subfolder.',
      input_schema: {
        type: 'object',
        properties: { dir: { type: 'string' } }
      },
      run: (i) => JSON.stringify(vault.listNotes(vaultPath(), i?.dir ?? '.'))
    },
    {
      name: 'read_note',
      description: 'Read a note by vault-relative path.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path']
      },
      run: (i) => vault.readNote(vaultPath(), i.path)
    },
    {
      name: 'write_note',
      description: 'Create or overwrite a note. Use append_to_note for additions to existing notes.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: "Vault-relative, e.g. 'Inbox/2026-06-10 Idea.md'" },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      },
      run: (i) => { vault.writeNote(vaultPath(), i.path, i.content); return JSON.stringify({ ok: true }) }
    },
    {
      name: 'surface_to_chronos',
      description: "Hand actionable items to Chronos's backlog for tomorrow morning. Use only for clearly actionable items extracted from the user's words — conservative extraction, never invented work.",
      input_schema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                notes: { type: 'string' },
                expected_minutes: { type: 'integer' },
                category: { type: 'string' }
              },
              required: ['title']
            }
          }
        },
        required: ['items']
      },
      run: (i) => {
        const db = getDb()
        const tomorrow = new Date(Date.now() + 86_400_000)
        const due = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
        const ins = db.prepare(
          'INSERT INTO tasks (title, notes, due, expected_minutes, category) VALUES (?, ?, ?, ?, ?)'
        )
        const ids = i.items.map((it: any) =>
          Number(ins.run(it.title, (it.notes ?? '') + ' (surfaced by Apollo from your thought dump)', due, it.expected_minutes ?? 30, it.category ?? 'personal').lastInsertRowid)
        )
        return JSON.stringify({ ok: true, created: ids })
      }
    },
    {
      name: 'append_to_note',
      description: 'Append markdown to an existing note (creates it if missing).',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      },
      run: (i) => { vault.appendToNote(vaultPath(), i.path, i.content); return JSON.stringify({ ok: true }) }
    }
  ]
}
