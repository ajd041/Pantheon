import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, CalEvent, Task } from '../lib/ipc'

const DAY_START = 6
const DAY_END = 22
const PX_PER_MIN = 0.8
const DAY_MIN = (DAY_END - DAY_START) * 60

const QUADRANT: Record<number, { label: string; cls: string }> = {
  1: { label: 'Do', cls: 'q1' },
  2: { label: 'Plan', cls: 'q2' },
  3: { label: 'Delegate', cls: 'q3' },
  4: { label: 'Drop', cls: 'q4' }
}
const DEFAULT_CATEGORIES = ['personal', 'work', 'errand', 'habit']
const STICKY: Record<string, string> = {
  personal: '#FBF0C9', work: '#DCE9F5', errand: '#FAD9DC', habit: '#DDEEDD'
}
const stickyStyle = (t: { id: number; category: string }, done = false): React.CSSProperties => ({
  ['--sticky' as any]: done ? '#ECE9E1' : (STICKY[t.category] ?? '#F6EFD4'),
  transform: `rotate(${((t.id % 5) - 2) * 0.7}deg)`
})

const RITUALS = [
  { label: 'Morning alignment', prompt: "Let's do my morning alignment. Walk me through today: what's on the calendar, what's on my plate, what matters most. Then propose a time-blocked day — include my habit blocks — and leave me some breathing room." },
  { label: 'Realign my day', prompt: "My day has shifted and I need to realign. Look at what's left on my schedule and the time remaining, and propose the smallest reshuffle that keeps today's intent intact." },
  { label: 'Evening wind-down', prompt: "Let's do my evening wind-down. What did I get done today? Lead with the wins, give me a light read on how my time tracked against expectations, and carry anything unfinished to tomorrow — no guilt." }
]

function pad(n: number): string { return String(n).padStart(2, '0') }
function dateKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function localISO(d: Date, minsFromMidnight: number): string {
  return `${dateKey(d)}T${pad(Math.floor(minsFromMidnight / 60))}:${pad(minsFromMidnight % 60)}`
}
function minsInDay(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
function fmtClock(mins: number): string {
  const h = Math.floor(mins / 60), m = mins % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = ((h + 11) % 12) + 1
  return m === 0 ? `${hh}${ampm}` : `${hh}:${pad(m)}${ampm}`
}
function fmtElapsed(sec: number): string {
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`
}

interface Timer { taskId: number; startedAt: number; baseSec: number }
interface ChatMsg { role: 'user' | 'assistant'; content: string }
type ArchiveRow = Pick<Task, 'id' | 'title' | 'expected_minutes' | 'actual_minutes' | 'category' | 'completed_at'>

export default function ChronosPage(props: { onAsk: (text: string) => void }) {
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [tasks, setTasks] = useState<Task[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [calNote, setCalNote] = useState('')
  const [timer, setTimer] = useState<Timer | null>(null)
  const [, setTick] = useState(0)
  const [newTitle, setNewTitle] = useState('')
  const [newMins, setNewMins] = useState(30)
  const [newCat, setNewCat] = useState('personal')
  const [filter, setFilter] = useState('all')
  const [openTask, setOpenTask] = useState<number | null>(null)
  const [subDraft, setSubDraft] = useState('')
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [archive, setArchive] = useState<ArchiveRow[] | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval>>()
  const chatEndRef = useRef<HTMLDivElement>(null)

  const reloadTasks = useCallback(() => { api().chronosTasks().then(setTasks) }, [])
  const reloadEvents = useCallback(() => {
    const from = new Date(date)
    const to = new Date(date)
    to.setDate(from.getDate() + 1)
    api().chronosEvents(from.toISOString(), to.toISOString()).then((r) => {
      setEvents(r.events)
      setCalNote(r.error ? 'Calendar offline — showing tasks only.' : '')
    })
  }, [date])

  useEffect(reloadTasks, [reloadTasks])
  useEffect(reloadEvents, [reloadEvents])
  useEffect(() => { api().chronosChatHistory().then(setChat) }, [])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, chatBusy])
  useEffect(() => {
    if (timer) tickRef.current = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(tickRef.current)
  }, [timer])

  const sendChat = async () => {
    const text = chatDraft.trim()
    if (!text || chatBusy) return
    setChatDraft('')
    setChat((c) => [...c, { role: 'user', content: text }])
    setChatBusy(true)
    try {
      const res = await api().chronosChat(text)
      setChat((c) => [...c, { role: 'assistant', content: res.text }])
    } catch (e: any) {
      setChat((c) => [...c, { role: 'assistant', content: `Something went wrong: ${e?.message ?? e}` }])
    } finally {
      setChatBusy(false)
      reloadTasks()
      reloadEvents()
    }
  }

  const schedule = async (id: number, startMins: number, d: Date = date) => {
    await api().chronosUpdateTask(id, { scheduled_start: localISO(d, startMins) })
    reloadTasks()
  }
  const unschedule = async (id: number) => {
    await api().chronosUpdateTask(id, { scheduled_start: null })
    reloadTasks()
  }
  const patchTask = async (id: number, patch: Partial<Task>) => {
    await api().chronosUpdateTask(id, patch)
    reloadTasks()
  }
  const addTask = async () => {
    const title = newTitle.trim()
    if (!title) return
    setNewTitle('')
    await api().chronosAddTask({ title, expected_minutes: newMins, category: newCat })
    reloadTasks()
  }
  const addSubtask = async (taskId: number) => {
    const t = subDraft.trim()
    if (!t) return
    setSubDraft('')
    await api().chronosAddSubtask(taskId, t)
    reloadTasks()
  }

  const timerTask = tasks.find((t) => t.id === timer?.taskId)
  const elapsedSec = timer ? timer.baseSec + Math.floor((Date.now() - timer.startedAt) / 1000) : 0
  const overrun = !!(timer && timerTask && elapsedSec / 60 > timerTask.expected_minutes)

  const startTimer = (t: Task) => setTimer({ taskId: t.id, startedAt: Date.now(), baseSec: t.actual_minutes * 60 })
  const pauseTimer = async () => {
    if (!timer) return
    await api().chronosUpdateTask(timer.taskId, { actual_minutes: Math.max(1, Math.round(elapsedSec / 60)) })
    setTimer(null)
    reloadTasks()
  }
  const finishTask = async (id: number, viaTimer: boolean) => {
    const patch: Partial<Task> = { done: 1 }
    if (viaTimer && timer) patch.actual_minutes = Math.round(elapsedSec / 60)
    await api().chronosUpdateTask(id, patch)
    if (timer?.taskId === id) setTimer(null)
    reloadTasks()
  }

  const categories = useMemo(() => {
    const found = new Set(DEFAULT_CATEGORIES)
    tasks.forEach((t) => t.category && found.add(t.category))
    return [...found]
  }, [tasks])

  const todayKey = dateKey(new Date())
  const open = tasks.filter((t) => !t.done && (filter === 'all' || t.category === filter))
  const colBacklog = open.filter((t) => !t.scheduled_start && t.actual_minutes === 0)
  const colLater = open.filter((t) => t.scheduled_start && t.scheduled_start.slice(0, 10) !== todayKey && t.actual_minutes === 0)
  const colTodo = open.filter((t) => t.scheduled_start?.slice(0, 10) === todayKey && t.actual_minutes === 0)
  const colProgress = open.filter((t) => t.actual_minutes > 0)
  const colDone = tasks.filter((t) => t.done && (filter === 'all' || t.category === filter))

  const dayTasks = tasks.filter((t) => !t.done && t.scheduled_start?.slice(0, 10) === dateKey(date))
  const dayEvents = useMemo(
    () => events.filter((e) => new Date(e.start).toDateString() === date.toDateString()),
    [events, date]
  )

  const nextFreeHalfHour = (): number => {
    const now = new Date()
    let m = Math.max(DAY_START * 60, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const busy = [
      ...dayEvents.map((e) => [minsInDay(e.start), minsInDay(e.end)]),
      ...tasks.filter((t) => !t.done && t.scheduled_start?.slice(0, 10) === todayKey)
        .map((t) => [minsInDay(t.scheduled_start!), minsInDay(t.scheduled_start!) + t.expected_minutes])
    ]
    while (m < DAY_END * 60 && busy.some(([a, b]) => m < b && m + 30 > a)) m += 30
    return Math.min(m, DAY_END * 60 - 30)
  }

  const dragId = (e: React.DragEvent) => Number(e.dataTransfer.getData('text/plain'))
  const allowDrop = (e: React.DragEvent) => e.preventDefault()

  const shiftDate = (days: number) => {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(d)
  }

  const slots = Array.from({ length: DAY_MIN / 30 }, (_, i) => DAY_START * 60 + i * 30)

  const card = (t: Task, chip?: string) => {
    const isOpen = openTask === t.id
    const subDone = t.subtasks.filter((s) => s.done).length
    return (
      <div key={t.id} className="task-card" draggable={!isOpen} style={stickyStyle(t)}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}>
        <div className="task-top" onClick={() => { setOpenTask(isOpen ? null : t.id); setSubDraft('') }}>
          <button className="mini check-btn" title="Mark complete"
            onClick={(e) => { e.stopPropagation(); finishTask(t.id, false) }}>✓</button>
          <span className="task-title">{t.title}</span>
          <button className={`quad ${QUADRANT[t.quadrant].cls}`}
            onClick={(e) => { e.stopPropagation(); patchTask(t.id, { quadrant: ((t.quadrant % 4) + 1) as Task['quadrant'] }) }}
            title="Eisenhower quadrant — click to change">{QUADRANT[t.quadrant].label}</button>
        </div>
        <div className="task-sub">
          {t.actual_minutes > 0 ? `${t.actual_minutes}/${t.expected_minutes}m` : `${t.expected_minutes}m`}
          {` · ${t.category}`}
          {t.subtasks.length > 0 && ` · ${subDone}/${t.subtasks.length}`}
          {chip && ` · ${chip}`}
          {t.due && ` · due ${t.due.slice(5, 10)}`}
        </div>
        {isOpen && (
          <div className="task-edit">
            {t.subtasks.length > 0 && (
              <div className="checklist">
                {t.subtasks.map((st) => (
                  <label key={st.id} className={`check ${st.done ? 'check-done' : ''}`}>
                    <input type="checkbox" checked={!!st.done}
                      onChange={async (e) => { await api().chronosToggleSubtask(st.id, e.target.checked ? 1 : 0); reloadTasks() }} />
                    <span>{st.title}</span>
                    <button className="mini" onClick={async () => { await api().chronosDeleteSubtask(st.id); reloadTasks() }} title="Remove item">×</button>
                  </label>
                ))}
              </div>
            )}
            <div className="row">
              <input value={subDraft} placeholder="Add checklist item…"
                onChange={(e) => setSubDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask(t.id)} />
              <button onClick={() => addSubtask(t.id)}>+</button>
            </div>
            <div className="row task-edit-row">
              <select value={t.expected_minutes}
                onChange={(e) => patchTask(t.id, { expected_minutes: Number(e.target.value) })} aria-label="Expected minutes">
                {[15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m}m</option>)}
              </select>
              <select value={t.category} onChange={(e) => patchTask(t.id, { category: e.target.value })} aria-label="Category">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={t.due?.slice(0, 10) ?? ''}
                onChange={(e) => patchTask(t.id, { due: e.target.value || (null as any) })} aria-label="Due date" />
            </div>
            <div className="row task-edit-row">
              {timer?.taskId !== t.id && t.scheduled_start && <button onClick={() => startTimer(t)}>▶ Track</button>}
              {t.scheduled_start && <button onClick={() => unschedule(t.id)}>Unschedule</button>}
              <button className="danger" onClick={async () => { await api().chronosDeleteTask(t.id); setOpenTask(null); reloadTasks() }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="chronos">
      <header className="chronos-head">
        <div className="row">
          <h1>Chronos</h1>
          <span className="chronos-date">
            {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <div className="row">
          {RITUALS.map((r) => (
            <button key={r.label} className="ritual" onClick={() => props.onAsk(r.prompt)}>{r.label}</button>
          ))}
        </div>
        <div className="row">
          <button onClick={() => shiftDate(-1)} aria-label="Previous day">‹</button>
          <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDate(d) }}>Today</button>
          <button onClick={() => shiftDate(1)} aria-label="Next day">›</button>
        </div>
      </header>

      <div className="chronos-chat">
        <div className="cchat-log">
          {chat.length === 0 && <p className="cchat-hint">Ask Chronos directly — "add a task tomorrow at 2:30pm, doctor's appointment, one hour."</p>}
          {chat.slice(-30).map((m, i) => (
            <div key={i} className={`cchat-msg cchat-${m.role}`}>{m.content}</div>
          ))}
          {chatBusy && <div className="cchat-msg cchat-assistant cchat-pending">arranging…</div>}
          <div ref={chatEndRef} />
        </div>
        <div className="cchat-input row">
          <input
            value={chatDraft}
            placeholder="Tell Chronos what you need…"
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            disabled={chatBusy}
          />
          <button onClick={sendChat} disabled={chatBusy || !chatDraft.trim()}>Send</button>
        </div>
      </div>

      {calNote && <p className="cal-note">{calNote}</p>}

      <div className="chronos-body">
        <div className="agenda">
          <div className="timeline" style={{ height: DAY_MIN * PX_PER_MIN }}>
            {slots.map((m) => (
              <div key={m} className="slot"
                style={{ top: (m - DAY_START * 60) * PX_PER_MIN, height: 30 * PX_PER_MIN }}
                onDragOver={allowDrop}
                onDrop={(e) => { const id = dragId(e); if (id) schedule(id, m) }}>
                {m % 60 === 0 && <span className="slot-time">{fmtClock(m)}</span>}
              </div>
            ))}
            {dayEvents.map((ev) => {
              const start = minsInDay(ev.start)
              const len = Math.max(20, minsInDay(ev.end) - start)
              return (
                <div key={ev.id} className="block block-event"
                  style={{ top: (start - DAY_START * 60) * PX_PER_MIN, height: len * PX_PER_MIN }}>
                  <span className="block-title">{ev.summary}</span>
                </div>
              )
            })}
            {dayTasks.map((t) => {
              const start = minsInDay(t.scheduled_start!)
              return (
                <div key={t.id} draggable className="block block-task"
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                  style={{ top: (start - DAY_START * 60) * PX_PER_MIN, height: Math.max(22, t.expected_minutes * PX_PER_MIN) }}>
                  <span className="block-title">{t.title}</span>
                  <span className="block-actions">
                    {timer?.taskId !== t.id && <button className="mini" onClick={() => startTimer(t)} title="Start stopwatch">▶</button>}
                    <button className="mini" onClick={() => finishTask(t.id, false)} title="Mark done">✓</button>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="kanban">
          <div className="kanban-tools">
            <div className="backlog-add row">
              <input value={newTitle} placeholder="New task…" onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTask()} />
              <select value={newMins} onChange={(e) => setNewMins(Number(e.target.value))} aria-label="Expected minutes">
                {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}m</option>)}
              </select>
              <select value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Category">
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={addTask}>Add</button>
            </div>
            <div className="cat-filter">
              {['all', ...categories].map((c) => (
                <button key={c} className={`cat-chip ${filter === c ? 'cat-on' : ''}`} onClick={() => setFilter(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div className="kanban-cols">
            <section className="kcol" onDragOver={allowDrop}
              onDrop={(e) => { const id = dragId(e); if (id) unschedule(id) }}>
              <h2>Backlog <span className="kcount">{colBacklog.length}</span></h2>
              <div className="kcol-list">
                {colBacklog.map((t) => card(t))}
                {colLater.length > 0 && <div className="klater">scheduled later</div>}
                {colLater.map((t) => card(t, t.scheduled_start!.slice(5, 10)))}
              </div>
            </section>

            <section className="kcol" onDragOver={allowDrop}
              onDrop={(e) => { const id = dragId(e); if (id) schedule(id, nextFreeHalfHour(), new Date()) }}>
              <h2>To-Do <span className="kcount">{colTodo.length}</span></h2>
              <div className="kcol-list">
                {colTodo.map((t) => card(t, fmtClock(minsInDay(t.scheduled_start!))))}
                {colTodo.length === 0 && <p className="kempty">Drop a task here to put it on today.</p>}
              </div>
            </section>

            <section className="kcol">
              <h2>In-Progress <span className="kcount">{colProgress.length}</span></h2>
              <div className="kcol-list">
                {colProgress.map((t) => card(t, t.scheduled_start
                  ? (t.scheduled_start.slice(0, 10) === todayKey ? fmtClock(minsInDay(t.scheduled_start)) : t.scheduled_start.slice(5, 10))
                  : undefined))}
              </div>
            </section>

            <section className="kcol kcol-done" onDragOver={allowDrop}
              onDrop={(e) => { const id = dragId(e); if (id) finishTask(id, false) }}>
              <h2>Completed <span className="kcount">{colDone.length}</span>
                <button className="archive-link" onClick={() => api().chronosArchive().then(setArchive)}>archive</button>
              </h2>
              <div className="kcol-list">
                {colDone.map((t) => (
                  <div key={t.id} className="task-card task-done-card" style={stickyStyle(t, true)}>
                    <div className="task-top">
                      <span className="task-title">{t.title}</span>
                      <button className="mini" title="Reopen" onClick={() => patchTask(t.id, { done: 0 })}>↺</button>
                    </div>
                    <div className="task-sub">
                      {t.actual_minutes > 0 ? `${t.actual_minutes}m tracked · ` : ''}
                      {t.completed_at && new Date(t.completed_at + 'Z').toLocaleDateString(undefined, { weekday: 'short' })}
                    </div>
                  </div>
                ))}
                {colDone.length === 0 && <p className="kempty">Wins land here, then archive weekly.</p>}
              </div>
            </section>
          </div>
        </div>
      </div>

      {archive && (
        <div className="modal-veil" onClick={() => setArchive(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Archive</h2>
            {archive.length === 0 && <p className="kempty">Nothing archived yet — completions move here at each week's turn.</p>}
            {archive.map((t) => (
              <div key={t.id} className="archive-row">
                <span>{t.title}</span>
                <span className="task-sub">{t.category} · {t.actual_minutes || t.expected_minutes}m · {t.completed_at?.slice(0, 10)}</span>
              </div>
            ))}
            <div className="row modal-actions"><button onClick={() => setArchive(null)}>Close</button></div>
          </div>
        </div>
      )}

      {timer && timerTask && (
        <footer className={`stopwatch ${overrun ? 'stopwatch-over' : ''}`}>
          <span className="sw-title">{timerTask.title}</span>
          <span className="sw-time">{fmtElapsed(elapsedSec)} <span className="sw-expected">/ {timerTask.expected_minutes}m</span></span>
          {overrun && (
            <button className="primary" onClick={() => {
              pauseTimer()
              props.onAsk(`I'm running over on "${timerTask.title}" — expected ${timerTask.expected_minutes} minutes and I'm at ${Math.round(elapsedSec / 60)}. Please extend its block and rearrange the rest of my day to absorb it.`)
            }}>Have Chronos realign my day</button>
          )}
          <button onClick={pauseTimer}>Pause</button>
          <button onClick={() => finishTask(timerTask.id, true)}>Done</button>
        </footer>
      )}
    </div>
  )
}
