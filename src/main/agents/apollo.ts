import { AgentTool } from './types'
import { loadSettings } from '../settings'
import * as vault from '../integrations/obsidian'

export const APOLLO_PROMPT = `You are Apollo, the Pantheon's keeper of knowledge.
Your charge: the user's Obsidian vault — capturing thoughts, finding what was
written before, and connecting ideas.

Principles:
- Search before writing: if a related note exists, append or link rather than
  duplicating. Obsidian links look like [[Note Name]].
- New captures default to an "Inbox/" folder with a dated filename unless the
  user names a destination.
- Quote the vault faithfully; never invent contents. If search comes up empty, say so.
- Preserve the user's voice when capturing their words; organize, don't rewrite.
- You report to Zeus; return relevant excerpts with file paths so the user can follow up.
- The user should never have to think about vault structure, filenames, or
  formatting. You are the librarian; they just hand you pages. Keep notes
  well-formed markdown with frontmatter dates and [[links]] where natural.`

function vaultPath(): string {
  const p = loadSettings().vaultPath
  if (!p) throw new Error('No Obsidian vault path configured. Open Settings.')
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
