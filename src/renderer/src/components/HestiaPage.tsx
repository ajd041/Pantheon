import { useEffect, useRef, useState } from 'react'
import { api, HestiaOverview } from '../lib/ipc'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const FLAME = <path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1.5-.5-2 0-3 2 1.5 4 4 4 7a6 6 0 0 1-12 0c0-5 4-7 6-11zM5 21h14v1H5v-1z" />

function MacroBar({ label, value, target, unit }: { label: string; value: number; target: number | null; unit: string }) {
  const pct = target ? Math.min(100, Math.round((value / target) * 100)) : null
  return (
    <div className="macro">
      <div className="macro-top">
        <span>{label}</span>
        <span className="macro-nums">
          {Math.round(value)}{target ? ` / ${Math.round(target)}` : ''} {unit}
        </span>
      </div>
      <div className="goal-bar macro-bar"><i style={{ width: `${pct ?? Math.min(100, value > 0 ? 30 : 0)}%`, opacity: target ? 1 : 0.35 }} /></div>
    </div>
  )
}

export default function HestiaPage() {
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [ov, setOv] = useState<HestiaOverview | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const reload = () => { api().hestiaOverview().then(setOv) }

  useEffect(() => { api().hestiaChatHistory().then(setChat) }, [])
  useEffect(reload, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, busy])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setDraft('')
    setChat((c) => [...c, { role: 'user', content: t }])
    setBusy(true)
    try {
      const res = await api().hestiaChat(t)
      setChat((c) => [...c, { role: 'assistant', content: res.text }])
    } catch (e: any) {
      setChat((c) => [...c, { role: 'assistant', content: `Something went wrong: ${e?.message ?? e}` }])
    } finally {
      setBusy(false)
      reload()
    }
  }

  const logEnergy = async (level: number) => {
    await api().hestiaLogEnergy(level)
    reload()
  }

  return (
    <div className="hestia">
      <header className="hestia-head">
        <div className="row">
          <h1>Hestia</h1>
          <span className="chronos-date">the hearth</span>
        </div>
        <div className="row energy-quick" title="How's your energy right now? 1 drained — 5 lit">
          <span className="energy-label">energy</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n}
              className={`energy-btn ${ov?.energy && ov.energy.energy === n ? 'energy-on' : ''}`}
              onClick={() => logEnergy(n)}>{n}</button>
          ))}
        </div>
      </header>

      <div className="hestia-body">
        <main className="apollo-chat">
          <div className="scroll hestia-scroll">
            {chat.length === 0 && (
              <div className="empty">
                <p className="empty-display">The fire's lit.</p>
                <p>"Chicken burrito and a coke" is a complete sentence here — Hestia handles the numbers.</p>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`msg msg-${m.role} ${m.role === 'assistant' ? 'msg-hestia' : ''}`}>
                {m.role === 'assistant' && (
                  <svg className="marginalia marginalia-hestia" viewBox="0 0 24 24" aria-hidden="true">{FLAME}</svg>
                )}
                <div className="msg-body">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant msg-hestia msg-scribe">
                <svg className="marginalia marginalia-hestia" viewBox="0 0 24 24" aria-hidden="true">{FLAME}</svg>
                <svg className="scribe-line" viewBox="0 0 130 16" aria-label="Hestia is writing">
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
              placeholder="What did you eat, lift, or feel?"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
              }}
              disabled={busy}
            />
            <button onClick={() => send(draft)} disabled={busy || !draft.trim()}>Send</button>
          </div>
        </main>

        <aside className="hearth">
          <h2>Today</h2>
          {ov && (
            <>
              <MacroBar label="Calories" value={ov.totals.calories} target={ov.targets?.calories ?? null} unit="kcal" />
              <MacroBar label="Protein" value={ov.totals.protein_g} target={ov.targets?.protein_g ?? null} unit="g" />
              <MacroBar label="Carbs" value={ov.totals.carbs_g} target={ov.targets?.carbs_g ?? null} unit="g" />
              <MacroBar label="Fat" value={ov.totals.fat_g} target={ov.targets?.fat_g ?? null} unit="g" />
              {ov.totals.any_estimated && <p className="est-note">~ includes Hestia's estimates</p>}
              {!ov.targets && <p className="est-note">No targets set — ask Hestia to set some if you want the bars to mean something.</p>}

              <h2>Meals</h2>
              <div className="ledger-list">
                {ov.meals.map((m) => (
                  <div key={m.id} className="meal-row">
                    <span className="meal-desc">{m.description}</span>
                    <span className="meal-cal">{m.calories != null ? `${m.calories}${m.estimated ? '~' : ''}` : '—'}</span>
                  </div>
                ))}
                {ov.meals.length === 0 && <p className="kempty">Nothing logged yet today.</p>}
              </div>

              <h2>Movement</h2>
              <div className="ledger-list">
                {ov.workouts.map((w) => (
                  <div key={w.id} className="meal-row">
                    <span className="meal-desc">{w.description}</span>
                    <span className="meal-cal">{w.duration_min ? `${w.duration_min}m` : w.intensity}</span>
                  </div>
                ))}
                {ov.workouts.length === 0 && <p className="kempty">No movement logged — rest counts too.</p>}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
