-- Pantheon local store. One file, five domains.

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  due TEXT,                      -- ISO date or datetime, nullable
  priority INTEGER DEFAULT 2,    -- 1 high, 2 normal, 3 low
  quadrant INTEGER DEFAULT 2,    -- Eisenhower: 1 do, 2 plan, 3 delegate, 4 drop
  expected_minutes INTEGER DEFAULT 30,
  actual_minutes INTEGER DEFAULT 0,
  scheduled_start TEXT,          -- local ISO datetime when time-blocked, else NULL
  category TEXT DEFAULT 'personal',  -- work | personal | errand | habit | anything
  done INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cadence TEXT DEFAULT 'daily',  -- daily | weekly | custom note
  target_per_week INTEGER DEFAULT 7,
  why TEXT DEFAULT '',           -- the user's stated motivation; Hermes coaches with it
  created_at TEXT DEFAULT (datetime('now')),
  archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id),
  logged_on TEXT NOT NULL,       -- ISO date
  note TEXT DEFAULT '',
  UNIQUE(habit_id, logged_on)
);

CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eaten_at TEXT DEFAULT (datetime('now')),
  description TEXT NOT NULL,
  calories INTEGER,              -- optional, user-supplied or estimated
  tags TEXT DEFAULT ''           -- comma-separated, e.g. "breakfast,high-protein"
);

CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  done_at TEXT DEFAULT (datetime('now')),
  description TEXT NOT NULL,
  duration_min INTEGER,
  intensity TEXT DEFAULT 'moderate'  -- light | moderate | hard
);

CREATE TABLE IF NOT EXISTS energy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  logged_at TEXT DEFAULT (datetime('now')),
  energy INTEGER NOT NULL,       -- 1..5
  mood TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,            -- 'user' | 'assistant'
  content TEXT NOT NULL,
  agents TEXT DEFAULT '',        -- comma-separated gods consulted for this reply
  channel TEXT DEFAULT 'zeus',   -- 'zeus' = main journal, 'chronos' = board chat
  created_at TEXT DEFAULT (datetime('now'))
);
