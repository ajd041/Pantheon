import { useEffect, useRef, useState } from 'react'
import AgentRail from './components/AgentRail'
import Message from './components/Message'
import Composer from './components/Composer'
import SettingsModal from './components/SettingsModal'
import ChronosPage from './components/ChronosPage'
import ApolloPage from './components/ApolloPage'
import HermesPage from './components/HermesPage'
import HestiaPage from './components/HestiaPage'
import Ephemera from './components/Ephemera'
import Logomark from './components/Logomark'
import { api, ChatMessage, GodName } from './lib/ipc'

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [active, setActive] = useState<Partial<Record<GodName, string>>>({})
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [view, setView] = useState<GodName>('zeus')
  const [freshIdx, setFreshIdx] = useState(-1)
  const [refreshKey, setRefreshKey] = useState(0)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api().history().then(setMessages)
    return api().onActivity((e) => {
      setActive((prev) => {
        const next = { ...prev }
        if (e.state === 'done') delete next[e.god]
        else next[e.god] = e.state === 'tool' ? (e.detail ?? 'working') : 'thinking…'
        return next
      })
    })
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy, view])

  const send = async (text: string) => {
    setMessages((m) => [...m, { role: 'user', content: text }])
    setBusy(true)
    try {
      const res = await api().send(text)
      setMessages((m) => {
        setFreshIdx(m.length)
        return [...m, { role: 'assistant', content: res.text, agents: res.agents.join(',') }]
      })
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Something went wrong: ${e?.message ?? e}` }])
    } finally {
      setBusy(false)
      setActive({})
      setRefreshKey((k) => k + 1)
    }
  }

  const askFromBoard = (text: string) => {
    setView('zeus')
    void send(text)
  }

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <Logomark size={30} />
          <span className="wordmark">PANTHEON</span>
        </div>
        <AgentRail active={active} view={view} onSelect={setView} />
      </div>

      <main className={`hall ${view !== 'zeus' ? 'hall-board' : ''}`}>
        {view === 'zeus' && (
          <>
            <header className="hall-head">
              <div className="row">
                <h1>Zeus</h1>
                <span className="head-date">{today}</span>
              </div>
              <button className="gear" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
            </header>
            <div className="zeus-body">
              <div className="zeus-chat">
                <div className="scroll">
                  {messages.length === 0 && (
                    <div className="empty">
                      <p className="empty-display">The gods are listening.</p>
                      <p>Ask about your day, log a meal, capture an idea, or start a habit.</p>
                    </div>
                  )}
                  {messages.map((m, i) => <Message key={i} msg={m} animate={i === freshIdx} />)}
                  {busy && (
                    <div className="msg msg-assistant msg-scribe">
                      <svg className="marginalia" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M13 2 6 13h4l-2 9 8-12h-4l3-8z" />
                      </svg>
                      <svg className="scribe-line" viewBox="0 0 130 16" aria-label="Zeus is writing">
                        <path d="M3 9 C 12 2, 20 15, 30 8 S 48 2, 58 9 76 15 86 8 104 3 116 9 124 12 127 8" fill="none" />
                      </svg>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
                <Composer disabled={busy} onSend={send} />
              </div>
              <Ephemera onSelect={setView} refreshKey={refreshKey} />
            </div>
          </>
        )}

        {view === 'chronos' && <ChronosPage onAsk={askFromBoard} />}
        {view === 'hermes' && <HermesPage />}
        {view === 'apollo' && <ApolloPage />}
        {view === 'hestia' && <HestiaPage />}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
