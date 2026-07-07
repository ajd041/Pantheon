import { GodName } from '../lib/ipc'

const GODS: { id: GodName; name: string; domain: string; glyph: JSX.Element }[] = [
  {
    id: 'zeus', name: 'Zeus', domain: 'Orchestrator',
    glyph: <path d="M13 2 6 13h4l-2 9 8-12h-4l3-8z" /> // thunderbolt
  },
  {
    id: 'chronos', name: 'Chronos', domain: 'Time & tasks',
    glyph: <path d="M6 3h12v3l-4.5 6L18 18v3H6v-3l4.5-6L6 6V3zm2 2v1l4 5.3L16 6V5H8zm4 8.7L8 19v0h8l-4-5.3z" /> // hourglass
  },
  {
    id: 'hermes', name: 'Hermes', domain: 'Habits',
    glyph: <path d="M3 16c4 0 5-2 7-2s3 2 6 2c2.5 0 4-1 5-2.5-1.5.5-3 .2-4-.8l-5-5c-.8-.8-2-.8-2.8 0L3 14v2zm14-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> // winged sandal (stylized)
  },
  {
    id: 'apollo', name: 'Apollo', domain: 'Knowledge',
    glyph: <path d="M7 3c-1 4 0 7 2 9h2V5c0-1-2-2-4-2zm10 0c-2 0-4 1-4 2v7h2c2-2 3-5 2-9zM9 14h6v2h-2v5h-2v-5H9v-2z" /> // lyre (stylized)
  },
  {
    id: 'hestia', name: 'Hestia', domain: 'Hearth & health',
    glyph: <path d="M12 2c1 3-2 4-2 7a2 2 0 0 0 4 0c0-1.5-.5-2 0-3 2 1.5 4 4 4 7a6 6 0 0 1-12 0c0-5 4-7 6-11zM5 21h14v1H5v-1z" /> // hearth flame
  }
]

export default function AgentRail(props: {
  active: Partial<Record<GodName, string>>
  view: GodName
  onSelect: (god: GodName) => void
}) {
  return (
    <nav className="agora" aria-label="Agents">
      <div className="agora-title">PANTHEON</div>
      {GODS.map((g) => {
        const state = props.active[g.id]
        return (
          <button
            key={g.id}
            className={`god god-${g.id} ${state ? 'god-active' : ''} ${props.view === g.id ? 'god-current' : ''}`}
            title={`${g.name} — ${g.domain}`}
            onClick={() => props.onSelect(g.id)}
          >
            <svg viewBox="0 0 24 24" className="god-glyph" aria-hidden="true">{g.glyph}</svg>
            <div className="god-meta">
              <span className="god-name">{g.name}</span>
              <span className="god-domain">{state ?? g.domain}</span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}
