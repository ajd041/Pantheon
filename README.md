# Pantheon

A desktop assistant suite with one voice and four minds. **Zeus** is the orchestrator you talk to; he consults four domain gods, each with their own tools and data:

| God | Domain | Backing store |
|---|---|---|
| **Chronos** | Calendar & tasks — nothing falls through the cracks | Google Calendar + local SQLite tasks |
| **Hermes** | Habit coaching, long-term goals & accountability | SQLite (habits, streaks, goal progress) |
| **Apollo** | Knowledge, journaling & the thought dump | Built-in markdown library (or your Obsidian vault) |
| **Hestia** | Frictionless meal/macro tracking, workouts, energy | SQLite (meals with estimated macros, targets, workouts, energy) |

Built with Electron, TypeScript, React, `better-sqlite3`, the Anthropic SDK, and `googleapis`.

## Design

The UI is a journal open on a desk against a wall painted **Harajuku Morning** (Backdrop's light pink with a hint of peach, `#F6E0D9`). The chat is a warm paper page with ruled lines and a notebook margin rule. You write in the journal by hand (Caveat); the Pantheon answers in print. Display type is **GFS Didot** — the Greek didone tradition, nostalgic and on-theme.

Each god has a hallmark color carried through their journal tab in the Agora rail, their attribution chip on replies, and their active-state glow: **Zeus** purple `#7A5BA8` · **Chronos** green `#4C7C59` · **Hermes** blue `#46729E` · **Apollo** gold `#C9921C` · **Hestia** red `#C25450`.

## Philosophy

Pantheon exists because productivity software makes you organize the organizer — you spend as much time maintaining the system as being productive in it. Here, that work is delegated: filing, formatting, naming, scheduling mechanics, and bookkeeping are the gods' chores, done silently. This is baked into every agent's system prompt as an operating rule: act on sensible defaults, never ask the user to adopt a taxonomy, and treat any interaction that takes more than one message to log something as a failure. When tuning prompts, protect this property first.

## How it works

Every message you send goes to Zeus — a Claude conversation whose tools are `consult_chronos`, `consult_hermes`, `consult_apollo`, and `consult_hestia`. When Zeus calls one, that god spins up as its own Claude tool-loop with domain-specific tools (calendar CRUD, habit logging, vault search, meal logs…), does the work, and returns a report. Zeus weaves the reports into one reply. The Agora rail on the left gilds whichever god is currently working.

```
You ──▶ Zeus (orchestrator)
          ├─ consult_chronos ──▶ Google Calendar + tasks table
          ├─ consult_hermes  ──▶ habits + habit_logs tables
          ├─ consult_apollo  ──▶ Obsidian vault (filesystem)
          └─ consult_hestia  ──▶ meals / workouts / energy tables
```

All agent logic runs in the Electron **main process**; the renderer is a thin chat client over IPC. Chat history, tasks, habits, and health logs live in a single SQLite file in your OS user-data directory.

## Setup

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

Then open Settings (gear, top right):

1. **Anthropic API key** — create one at https://console.anthropic.com. Pantheon defaults to `claude-sonnet-4-6`; change the model string if you prefer.
2. **Library** — works out of the box; notes live as plain markdown in Pantheon's app data. Optionally point at an Obsidian vault folder instead. Apollo files captures into `Inbox/` and journal entries into `Journal/`. His signature ritual is the end-of-day **thought dump**: spill freely, he files a dated journal entry in your own words and conservatively surfaces genuinely actionable items into Chronos's backlog for tomorrow.
3. **Google Calendar** — needs a one-time Google Cloud setup:
   - Create a project at https://console.cloud.google.com, enable the **Google Calendar API**.
   - Configure the OAuth consent screen (External, add yourself as a test user).
   - Create an **OAuth client ID** of type **Desktop app**; copy the client ID and secret into Pantheon's settings.
   - Click **Connect Google Calendar** — your browser opens, you approve, done. Tokens are stored locally and refreshed automatically.

## The Chronos board

Chronos has his own page: a time-blocked daily agenda on the left (Google Calendar events + scheduled tasks; drag tasks between slots), a full task manager on the right (categories, Eisenhower quadrants, subtask checklists, durations, due dates), and a direct chat line to Chronos at the top with its own memory, separate from the Zeus journal. Anything Chronos does conversationally — "add a doctor's appointment tomorrow at 2:30, one hour" — lands in the same database the board renders, and the board refreshes after every reply. Ritual buttons (morning alignment, realignment, evening wind-down) launch guided planning conversations through Zeus.

## Packaging a Windows .exe

One-time: `npm install` (this also rebuilds the SQLite native module for Electron via the postinstall hook). Then:

```bash
npm run dist:win
```

This produces two things in `dist/`:

- **`Pantheon Setup 0.1.0.exe`** — a one-click installer. Run it once; Pantheon lands in your Start menu with its icon, and your data (settings, database, Google tokens) lives in `%APPDATA%/Pantheon`, surviving every update.
- **`Pantheon-portable.exe`** — a single self-contained file, no install. Slower to launch (it unpacks itself each run), but handy on a second machine.

When you receive an updated version of the source: extract it over your project folder (your `node_modules` and `dist` are untouched), run `npm run dist:win` again, and run the new installer — it updates in place, data intact. If dependencies changed in `package.json`, run `npm install` first.

Windows SmartScreen will warn on first launch because the exe is unsigned ("Windows protected your PC") — click **More info → Run anyway**. Code-signing certificates make that go away but cost money and are overkill for personal software.

## Security notes (read once)

- The API key, Google client secret, and OAuth tokens are stored **in plaintext JSON** in your user-data directory. That's normal for local-first tools, but know it's there. If you want OS-keychain storage, `keytar`/`safeStorage` is the upgrade path (see roadmap).
- Apollo's filesystem access is confined to the vault folder (path-escape guarded), and the renderer has no Node access (context isolation, no `nodeIntegration`).
- The gods can create/modify/delete real calendar events and notes when asked. Chronos is prompted to treat deletions as explicit-request-only, but prompts are not guarantees — keep that in mind before asking for sweeping changes.

## Project layout

```
src/main/              Electron main process — all the brains
  agents/
    orchestrator.ts    Zeus: history, routing, synthesis
    subagent.ts        shared tool-use loop for the four gods
    chronos.ts hermes.ts apollo.ts hestia.ts   prompts + toolboxes
  db/                  SQLite schema + connection
  integrations/        Google Calendar OAuth + API, Obsidian vault FS
  ipc.ts settings.ts index.ts
src/preload/           contextBridge API exposed to the renderer
src/renderer/          React chat UI (Agora rail, chat, settings)
```

## Roadmap ideas

- **Streaming** — stream Zeus's final reply token-by-token over IPC instead of waiting for the full message.
- **Proactive Chronos** — a morning briefing on launch: today's events + due tasks, unprompted.
- **Hermes nudges** — scheduled reminders for habits at their usual time, with snooze.
- **Apollo embeddings** — semantic vault search (local embeddings) instead of substring grep.
- **Hestia trends** — a small charts panel: energy over time vs. workout days.
- **Keychain storage** — move secrets into Electron `safeStorage`.
- **More gods** — Plutus (finance)? Asclepius (health records)? The pattern makes adding a god ~one file.
