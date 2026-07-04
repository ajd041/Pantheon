import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/ipc'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

const DUMP_PROMPT = "Let's do my end-of-day thought dump. I'm going to spill everything still on my mind — just receive it, and when I'm done, file it and pull out anything that genuinely belongs on tomorrow's plate."

export default function ApolloPage() {
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const [libNote, setLibNote] = useState('')
  const [reading, setReading] = useState<{ path: string; content: string } | null>(null)
  const [noteFilter, setNoteFilter] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const reloadNotes = () => {
    api().apolloListNotes().then((r) => {
      setNotes(r.notes.sort().reverse())
      setLibNote(r.error ?? '')
    })
  }

  useEffect(() => { api().apolloChatHistory().then(setChat) }, [])
  useEffect(reloadNotes, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat, busy])

  const send = async (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setDraft('')
    setChat((c) => [...c, { role: 'user', content: t }])
    setBusy(true)
    try {
      const res = await api().apolloChat(t)
      setChat((c) => [...c, { role: 'assistant', content: res.text }])
    } catch (e: any) {
      setChat((c) => [...c, { role: 'assistant', content: `Something went wrong: ${e?.message ?? e}` }])
    } finally {
      setBusy(false)
      reloadNotes()
    }
  }

  const openNote = async (rel: string) => {
    const r = await api().apolloReadNote(rel)
    setReading({ path: rel, content: r.error ?? r.content })
  }

  const shown = notes.filter((n) => n.toLowerCase().includes(noteFilter.toLowerCase()))

  return (
    <div className="apollo">
      <header className="apollo-head">
        <div className="row">
          <h1>Apollo</h1>
          <span className="chronos-date">the library</span>
        </div>
        <button className="ritual ritual-apollo" onClick={() => send(DUMP_PROMPT)}>Thought dump</button>
      </header>

      <div className="apollo-body">
        <main className="apollo-chat">
          <div className="scroll apollo-scroll">
            {chat.length === 0 && (
              <div className="empty">
                <p className="empty-display">Hand me your pages.</p>
                <p>Capture an idea, ask what you wrote, or end the day with a thought dump.</p>
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={`msg msg-${m.role} ${m.role === 'assistant' ? 'msg-apollo' : ''}`}>
                {m.role === 'assistant' && (
                  <svg className="marginalia marginalia-apollo" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 3c-1 4 0 7 2 9h2V5c0-1-2-2-4-2zm10 0c-2 0-4 1-4 2v7h2c2-2 3-5 2-9zM9 14h6v2h-2v5h-2v-5H9v-2z" />
                  </svg>
                )}
                <div className="msg-body">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="msg msg-assistant msg-apollo msg-scribe">
                <svg className="marginalia marginalia-apollo" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 3c-1 4 0 7 2 9h2V5c0-1-2-2-4-2zm10 0c-2 0-4 1-4 2v7h2c2-2 3-5 2-9zM9 14h6v2h-2v5h-2v-5H9v-2z" />
                </svg>
                <svg className="scribe-line" viewBox="0 0 130 16" aria-label="Apollo is writing">
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
              placeholder="Spill it — Apollo files everything…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) }
              }}
              disabled={busy}
            />
            <button onClick={() => send(draft)} disabled={busy || !draft.trim()}>Send</button>
          </div>
        </main>

        <aside className="library">
          <h2>Shelves</h2>
          <input
            className="lib-search"
            value={noteFilter}
            placeholder="Filter notes…"
            onChange={(e) => setNoteFilter(e.target.value)}
          />
          {libNote && <p className="kempty">{libNote}</p>}
          <div className="lib-list">
            {shown.map((n) => (
              <button key={n} className="lib-note" onClick={() => openNote(n)} title={n}>
                <span className="lib-note-name">{n.replace(/\.md$/, '')}</span>
              </button>
            ))}
            {shown.length === 0 && !libNote && (
              <p className="kempty">Empty shelves so far — your first capture or thought dump starts the collection.</p>
            )}
          </div>
        </aside>
      </div>

      {reading && (
        <div className="modal-veil" onClick={() => setReading(null)}>
          <div className="modal modal-reader" onClick={(e) => e.stopPropagation()}>
            <h2>{reading.path.replace(/\.md$/, '')}</h2>
            <pre className="reader-body">{reading.content}</pre>
            <div className="row modal-actions"><button onClick={() => setReading(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
