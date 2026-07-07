import { google } from 'googleapis'
import { app, shell } from 'electron'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { loadSettings } from '../settings'

const SCOPES = ['https://www.googleapis.com/auth/calendar']

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'google-token.json')
}

function makeClient() {
  const s = loadSettings()
  if (!s.googleClientId || !s.googleClientSecret) {
    throw new Error('Google client ID/secret not configured. Open Settings.')
  }
  // Redirect URI is filled in per-auth with the loopback port.
  return new google.auth.OAuth2(s.googleClientId, s.googleClientSecret, 'http://127.0.0.1')
}

export function isConnected(): boolean {
  return fs.existsSync(tokenFile())
}

function authedClient() {
  const client = makeClient()
  if (!isConnected()) throw new Error('Google Calendar is not connected yet. Connect it in Settings.')
  client.setCredentials(JSON.parse(fs.readFileSync(tokenFile(), 'utf-8')))
  client.on('tokens', (tokens) => {
    const existing = JSON.parse(fs.readFileSync(tokenFile(), 'utf-8'))
    fs.writeFileSync(tokenFile(), JSON.stringify({ ...existing, ...tokens }, null, 2))
  })
  return client
}

/**
 * Desktop loopback OAuth: start a one-shot local server, open the consent
 * page in the user's default browser, catch the redirect, exchange the code.
 */
export async function connect(): Promise<void> {
  const client = makeClient()
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const code = url.searchParams.get('code')
        if (!code) { res.end('No code in callback.'); return }
        const port = (server.address() as any).port
        const { tokens } = await client.getToken({ code, redirect_uri: `http://127.0.0.1:${port}` })
        fs.writeFileSync(tokenFile(), JSON.stringify(tokens, null, 2))
        res.end('Pantheon is connected to Google Calendar. You can close this tab.')
        server.close()
        resolve()
      } catch (e) {
        reject(e)
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        redirect_uri: `http://127.0.0.1:${port}`
      })
      shell.openExternal(authUrl)
    })
    setTimeout(() => { try { server.close() } catch {} ; reject(new Error('OAuth timed out after 3 minutes')) }, 180_000)
  })
}

export async function listEvents(timeMinISO: string, timeMaxISO: string) {
  const cal = google.calendar({ version: 'v3', auth: authedClient() })
  const res = await cal.events.list({
    calendarId: 'primary',
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50
  })
  return (res.data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    location: e.location ?? undefined,
    pantheonTask: e.extendedProperties?.private?.pantheonTaskId ?? undefined
  }))
}

export async function createEvent(input: {
  summary: string; startISO: string; endISO: string; description?: string; location?: string;
  privateProps?: Record<string, string>
}) {
  const cal = google.calendar({ version: 'v3', auth: authedClient() })
  const res = await cal.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startISO },
      end: { dateTime: input.endISO },
      extendedProperties: input.privateProps ? { private: input.privateProps } : undefined
    }
  })
  return { id: res.data.id, htmlLink: res.data.htmlLink }
}

export async function updateEvent(eventId: string, patch: Record<string, unknown>) {
  const cal = google.calendar({ version: 'v3', auth: authedClient() })
  const body: any = {}
  if (patch.summary) body.summary = patch.summary
  if (patch.description) body.description = patch.description
  if (patch.location) body.location = patch.location
  if (patch.startISO) body.start = { dateTime: patch.startISO }
  if (patch.endISO) body.end = { dateTime: patch.endISO }
  await cal.events.patch({ calendarId: 'primary', eventId, requestBody: body })
  return { ok: true }
}

export async function deleteEvent(eventId: string) {
  const cal = google.calendar({ version: 'v3', auth: authedClient() })
  await cal.events.delete({ calendarId: 'primary', eventId })
  return { ok: true }
}
