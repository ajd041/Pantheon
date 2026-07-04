import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
// Vite inlines the schema at build time, so it ships inside the bundle.
import schema from './schema.sql?raw'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const file = path.join(app.getPath('userData'), 'pantheon.db')
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(schema)
  // Additive migrations for databases created before these columns existed.
  for (const m of [
    "ALTER TABLE tasks ADD COLUMN quadrant INTEGER DEFAULT 2",
    "ALTER TABLE tasks ADD COLUMN expected_minutes INTEGER DEFAULT 30",
    "ALTER TABLE tasks ADD COLUMN actual_minutes INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN scheduled_start TEXT",
    "ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'personal'",
    "ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'zeus'",
    "ALTER TABLE habits ADD COLUMN minutes_per_session INTEGER DEFAULT 30",
    "ALTER TABLE meals ADD COLUMN protein_g REAL",
    "ALTER TABLE meals ADD COLUMN carbs_g REAL",
    "ALTER TABLE meals ADD COLUMN fat_g REAL",
    "ALTER TABLE meals ADD COLUMN estimated INTEGER DEFAULT 0"
  ]) {
    try { db.exec(m) } catch { /* column already exists */ }
  }
  return db
}
