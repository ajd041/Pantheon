import { useMemo } from 'react'
import { ChatMessage } from '../lib/ipc'

const GOD_LABEL: Record<string, string> = {
  chronos: 'Chronos', hermes: 'Hermes', apollo: 'Apollo', hestia: 'Hestia'
}

/** Reveals words with a quick ink-in animation, as if being written. */
function InkText({ text, animate }: { text: string; animate: boolean }) {
  const parts = useMemo(() => text.split(/(\s+)/), [text])
  if (!animate) return <>{text}</>
  let wordIdx = 0
  return (
    <>
      {parts.map((p, i) => {
        if (/^\s*$/.test(p)) return p
        const delay = Math.min(wordIdx++ * 26, 2400)
        return <span key={i} className="ink-word" style={{ animationDelay: `${delay}ms` }}>{p}</span>
      })}
    </>
  )
}

export default function Message({ msg, animate = false }: { msg: ChatMessage; animate?: boolean }) {
  const gods = (msg.agents ?? '').split(',').filter(Boolean)
  return (
    <div className={`msg msg-${msg.role}`}>
      {msg.role === 'assistant' && (
        <svg className="marginalia" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2 6 13h4l-2 9 8-12h-4l3-8z" />
        </svg>
      )}
      <div className="msg-body">
        <InkText text={msg.content} animate={animate && msg.role === 'assistant'} />
      </div>
      {msg.role === 'assistant' && gods.length > 0 && (
        <div className="msg-gods">
          {gods.map((g) => (
            <span key={g} className={`god-chip chip-${g}`}>{GOD_LABEL[g] ?? g}</span>
          ))}
        </div>
      )}
    </div>
  )
}
