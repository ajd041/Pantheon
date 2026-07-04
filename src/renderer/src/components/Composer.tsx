import { useState } from 'react'

export default function Composer(props: { disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState('')
  const send = () => {
    const t = text.trim()
    if (!t || props.disabled) return
    setText('')
    props.onSend(t)
  }
  return (
    <div className="composer">
      <textarea
        value={text}
        rows={1}
        placeholder="Speak to the Pantheon…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
        }}
      />
      <button onClick={send} disabled={props.disabled || !text.trim()}>Send</button>
    </div>
  )
}
