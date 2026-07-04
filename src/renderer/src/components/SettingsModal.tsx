import { useEffect, useState } from 'react'
import { api, Settings } from '../lib/ipc'

export default function SettingsModal(props: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null)
  const [gConnected, setGConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    api().getSettings().then(setS)
    api().googleStatus().then((r) => setGConnected(r.connected))
  }, [])

  if (!s) return null
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setS({ ...s, [k]: e.target.value })

  const save = async () => {
    await api().setSettings(s)
    setNote('Saved.')
    setTimeout(props.onClose, 500)
  }

  const connectGoogle = async () => {
    setBusy(true); setNote('A browser window opened — approve access there.')
    try {
      await api().setSettings(s) // make sure client id/secret are stored first
      await api().googleConnect()
      setGConnected(true)
      setNote('Google Calendar connected.')
    } catch (e: any) {
      setNote(e?.message ?? 'Connection failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-veil" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <label>Your name<input value={s.userName} onChange={set('userName')} placeholder="How Zeus should address you" /></label>
        <label>Anthropic API key<input value={s.anthropicApiKey} onChange={set('anthropicApiKey')} placeholder="sk-ant-…" type="password" /></label>
        <label>Model<input value={s.model} onChange={set('model')} /></label>

        <label>Obsidian vault
          <div className="row">
            <input value={s.vaultPath} onChange={set('vaultPath')} placeholder="/path/to/vault" />
            <button onClick={async () => { const p = await api().pickVault(); if (p) setS({ ...s, vaultPath: p }) }}>Choose folder</button>
          </div>
        </label>

        <fieldset>
          <legend>Google Calendar {gConnected ? '· connected' : '· not connected'}</legend>
          <label>Client ID<input value={s.googleClientId} onChange={set('googleClientId')} /></label>
          <label>Client secret<input value={s.googleClientSecret} onChange={set('googleClientSecret')} type="password" /></label>
          <button onClick={connectGoogle} disabled={busy || !s.googleClientId || !s.googleClientSecret}>
            {gConnected ? 'Reconnect' : 'Connect Google Calendar'}
          </button>
        </fieldset>

        {note && <p className="note">{note}</p>}
        <div className="row modal-actions">
          <button onClick={props.onClose}>Cancel</button>
          <button className="primary" onClick={save}>Save changes</button>
        </div>
      </div>
    </div>
  )
}
