import { useEffect, useRef, useState } from 'react'
import { api, GoalOverview, HabitOverview } from '../lib/ipc'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const INTAKE_PROMPT = "I want to start something new. Run me through your intake: ask what I'm after, whether it's a habit or a long-term goal, my why, the time I can realistically give each week, and the smallest version that counts. Then set it up and seed my first steps."
const REVIEW_PROMPT = "Give me an honest progress check across my habits and goals. Where am I on track, where have I slipped, and what's the smallest move to get back on the path I said I wanted?"

const SANDAL = <path d="M3 16c4 0 5-2 7-2s3 2 6 2c2.5 0 4-1 5-2.5-1.5.5-3 .2-4-.8l-5-5c-.8-.8-2-.8-2.8 0L3 14v2zm14-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />

export default function HermesPage() {
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [habits, setHabits] = useState<HabitOverview[]>([])
  const [goals, setGoals] = useState<GoalOverview[]>([])
  const [openGoal, setOpenGoal] = useState<number | null>(null)
  const [amountDraft, setAmountDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const reload = () => {
    api().hermesOverview().then((r) => { setHabits(r.habits); setGoals(r.goals) })
  }

  useEffect(() => { api().hermesChatHistory().then(setChat) }, [])
  useEffect(reload, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, busy])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setDraft('')
    setChat((c) => [...c, { role: 'user', content: t }])
    setBusy(true)
    try {
      const res = await api().hermesChat(t)
      setChat((c) => [...c, { role: 'assistant', content: res.text }])
    } catch (e: any) {
      setChat((c) => [...c, { role: 'assistant', content: `Something went wrong: ${e?.message ?? e}` }])
    } finally {
      setBusy(false)
      reload()
    }
  }

  const logHabit = async (h: HabitOverview) => {
    if (h.logged_today) return
    await api().hermesLogHabit(h.id)
    reload()
  }

  const logGoal = async (g: GoalOverview) => {
    const amount = parseFloat(amountDraft)
    if (!isFinite(amount) || amount <= 0) return
    setAmountDraft('')
    await api().hermesLogGoal(g.id, amount, '')
    reload()
  }

  const weekDots = (h: HabitOverview) => {
    const days: boolean[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
      days.push(h.last7.includes(d))
    }
    return days
  }

  return (
    <div className="hermes">
      <header className="hermes-head">
        <div className="row">
          <h1>Hermes</h1>
          <span className="chronos-date">habits &amp; goals</span>
        </div>
        <div className="row">
          <button className="ritual ritual-hermes" onClick={() => send(INTAKE_PROMPT)}>Begin something new</button>
          <button className="ritual ritual-hermes" onClick={() => send(REVIEW_PROMPT)}>Check my progress</button>
        </div>
      </header>

      <div className="hermes-body">
        <main className="apollo-chat">
          <div className="scroll hermes-scroll">
            {chat.length === 0 && (
              <div className="empty">
                <p className="empty-display">Small steps, taken often.</p>
                <p>Start something new, log a session, or ask for an honest look at how it's going.</p>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`msg msg-${m.role} ${m.role === 'assistant' ? 'msg-hermes' : ''}`}>
                {m.role === 'assistant' && (
                  <svg className="marginalia marginalia-hermes" viewBox="0 0 24 24" aria-hidden="true">{SANDAL}</svg>
                )}
                <div className="msg-body">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant msg-hermes msg-scribe">
                <svg className="marginalia marginalia-hermes" viewBox="0 0 24 24" aria-hidden="true">{SANDAL}</svg>
                <svg className="scribe-line" viewBox="0 0 130 16" aria-label="Hermes is writing">
                  <path d="M3 9 C 12 2, 20 15, 30 8 S 48 2, 58 9 76 15 86 8 104 3 116 9 124 12 127 8" fill="none" />
                </svg>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="composer">
            <textarea
              value={draft}
              rows={1}
              placeholder="Tell Hermes how it's going…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
              }}
              disabled={busy}
            />
            <button onClick={() => send(draft)} disabled={busy || !draft.trim()}>Send</button>
          </div>
        </main>

        <aside className="ledger">
          <h2>Habits</h2>
          <div className="ledger-list">
            {habits.map((h) => (
              <div key={h.id} className="habit-row" title={h.why || h.name}>
                <div className="habit-top">
                  <span className="habit-name">{h.name}</span>
                  <button
                    className={`habit-check ${h.logged_today ? 'habit-done' : ''}`}
                    onClick={() => logHabit(h)}
                    title={h.logged_today ? 'Logged today' : 'Log today'}
                  >✓</button>
                </div>
                <div className="habit-meta">
                  <span className="habit-dots">
                    {weekDots(h).map((on, i) => <i key={i} className={on ? 'dot dot-on' : 'dot'} />)}
                  </span>
                  <span>{h.week_count}/{h.target_per_week} wk{h.streak > 1 ? ` · ${h.streak}-day streak` : ''}</span>
                </div>
              </div>
            ))}
            {habits.length === 0 && <p className="kempty">No habits yet — "Begin something new" and Hermes will set one up with you.</p>}
          </div>

          <h2>Goals</h2>
          <div className="ledger-list">
            {goals.map((g) => {
              const pct = g.target_amount ? Math.min(100, Math.round((g.progress_total / g.target_amount) * 100)) : null
              const open = openGoal === g.id
              return (
                <div key={g.id} className="goal-row" title={g.why || g.title}>
                  <button className="goal-top" onClick={() => { setOpenGoal(open ? null : g.id); setAmountDraft('') }}>
                    <span className="habit-name">{g.title}</span>
                    {pct !== null && <span className="goal-pct">{pct}%</span>}
                  </button>
                  {g.target_amount ? (
                    <div className="goal-bar"><i style={{ width: `${pct}%` }} /></div>
                  ) : null}
                  <div className="habit-meta">
                    <span>
                      {g.target_amount
                        ? `${Math.round(g.progress_total).toLocaleString()} / ${Math.round(g.target_amount).toLocaleString()} ${g.unit}`
                        : 'milestone goal'}
                      {g.target_date ? ` · by ${g.target_date.slice(5)}` : ''}
                    </span>
                  </div>
                  {open && (
                    <div className="row goal-log">
                      <input
                        value={amountDraft}
                        placeholder={`+ ${g.unit || 'amount'}…`}
                        inputMode="decimal"
                        onChange={(e) => setAmountDraft(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && logGoal(g)}
                      />
                      <button onClick={() => logGoal(g)}>Log</button>
                    </div>
                  )}
                </div>
              )
            })}
            {goals.length === 0 && <p className="kempty">No goals on the board. Big things start here.</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}
