import { useEffect, useState } from 'react'
import { api, GodName, HestiaOverview, HabitOverview, Task } from '../lib/ipc'

function fmtClock(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours(), m = d.getMinutes()
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = ((h + 11) % 12) + 1
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`
}

/** The notebook ephemera margin (design 5a): each god surfaces its data as a
 *  little desk object. Clicking one opens that god's tab. */
export default function Ephemera(props: { onSelect: (god: GodName) => void; refreshKey: number }) {
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [habits, setHabits] = useState<HabitOverview[]>([])
  const [quote, setQuote] = useState<string>('')
  const [hestia, setHestia] = useState<HestiaOverview | null>(null)

  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10)
    api().chronosTasks().then((ts) => {
      setTodayTasks(
        ts.filter((t) => !t.done && t.scheduled_start?.slice(0, 10) === todayKey)
          .sort((a, b) => (a.scheduled_start! < b.scheduled_start! ? -1 : 1))
          .slice(0, 3)
      )
    }).catch(() => {})

    api().hermesOverview().then((r) => setHabits(r.habits.slice(0, 3))).catch(() => {})

    api().apolloListNotes().then(async (r) => {
      const journal = r.notes.filter((n) => n.startsWith('Journal/')).sort().reverse()
      const pick = journal[0] ?? r.notes.sort().reverse()[0]
      if (!pick) { setQuote(''); return }
      const note = await api().apolloReadNote(pick)
      const line = note.content.split('\n')
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('['))
      setQuote(line ? (line.length > 110 ? line.slice(0, 107) + '…' : line) : '')
    }).catch(() => {})

    api().hestiaOverview().then(setHestia).catch(() => {})
  }, [props.refreshKey])

  const streakHabit = habits.find((h) => h.streak > 1)

  return (
    <aside className="ephemera">
      <button className="eph eph-sticky" onClick={() => props.onSelect('chronos')}>
        <span className="eph-label" style={{ color: 'var(--chronos)' }}>Today — Chronos</span>
        {todayTasks.length > 0
          ? todayTasks.map((t) => (
            <span key={t.id} className="eph-line">{fmtClock(t.scheduled_start!)} · {t.title}</span>
          ))
          : <span className="eph-line">nothing blocked yet — come plan the day</span>}
      </button>

      <button className="eph eph-card" onClick={() => props.onSelect('hermes')}>
        <span className="eph-label" style={{ color: 'var(--hermes)' }}>Habits — Hermes</span>
        {habits.length > 0 ? (
          <>
            {habits.map((h) => (
              <span key={h.id} className={`eph-check ${h.logged_today ? 'eph-checked' : ''}`}>
                <i className="eph-box">{h.logged_today ? '✓' : ''}</i>
                <span>{h.name}</span>
              </span>
            ))}
            {streakHabit && (
              <span className="eph-streak">
                <span className="eph-dots">
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10)
                    return <i key={i} className={streakHabit.last7.includes(d) ? 'dot dot-on' : 'dot'} />
                  })}
                </span>
                {streakHabit.streak}-day streak
              </span>
            )}
          </>
        ) : <span className="eph-quiet">no habits yet — begin something new</span>}
      </button>

      {quote && (
        <button className="eph eph-quote" onClick={() => props.onSelect('apollo')}>
          <span className="eph-label" style={{ color: 'var(--apollo)' }}>From the journal — Apollo</span>
          <span className="eph-quote-text"><mark className="hl">{quote}</mark></span>
        </button>
      )}

      <button className="eph eph-washi" onClick={() => props.onSelect('hestia')}>
        <span className="eph-label" style={{ color: 'var(--hestia)' }}>The hearth — Hestia</span>
        {hestia ? (
          <>
            <span className="eph-metric">
              <span>energy</span>
              <span className="eph-bar"><i style={{ width: `${((hestia.energy?.energy ?? 0) / 5) * 100}%` }} /></span>
            </span>
            <span className="eph-metric">
              <span>{hestia.targets?.protein_g ? 'protein' : 'calories'}</span>
              <span className="eph-bar"><i style={{
                width: hestia.targets?.protein_g
                  ? `${Math.min(100, (hestia.totals.protein_g / hestia.targets.protein_g) * 100)}%`
                  : hestia.targets?.calories
                    ? `${Math.min(100, (hestia.totals.calories / hestia.targets.calories) * 100)}%`
                    : `${Math.min(100, hestia.totals.calories / 25)}%`
              }} /></span>
            </span>
          </>
        ) : <span className="eph-quiet">the fire's lit</span>}
      </button>
    </aside>
  )
}
