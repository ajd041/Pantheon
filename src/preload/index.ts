import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pantheon', {
  send: (message: string) => ipcRenderer.invoke('chat:send', message),
  history: () => ipcRenderer.invoke('chat:history'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s: Record<string, string>) => ipcRenderer.invoke('settings:set', s),
  pickVault: () => ipcRenderer.invoke('settings:pickVault'),
  usageSummary: () => ipcRenderer.invoke('usage:summary'),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  chronosTasks: () => ipcRenderer.invoke('chronos:tasks'),
  chronosAddTask: (t: Record<string, unknown>) => ipcRenderer.invoke('chronos:addTask', t),
  chronosUpdateTask: (id: number, patch: Record<string, unknown>) => ipcRenderer.invoke('chronos:updateTask', id, patch),
  chronosEvents: (timeMin: string, timeMax: string) => ipcRenderer.invoke('chronos:events', timeMin, timeMax),
  chronosArchive: () => ipcRenderer.invoke('chronos:archive'),
  chronosCreateEvent: (input: Record<string, string>) => ipcRenderer.invoke('chronos:createEvent', input),
  chronosMoveEvent: (eventId: string, startISO: string, endISO: string) => ipcRenderer.invoke('chronos:moveEvent', eventId, startISO, endISO),
  chronosDeleteEvent: (eventId: string) => ipcRenderer.invoke('chronos:deleteEvent', eventId),
  chronosChat: (message: string) => ipcRenderer.invoke('chronos:chat', message),
  chronosChatHistory: () => ipcRenderer.invoke('chronos:chatHistory'),
  chronosDeleteTask: (id: number) => ipcRenderer.invoke('chronos:deleteTask', id),
  chronosAddSubtask: (taskId: number, title: string) => ipcRenderer.invoke('chronos:addSubtask', taskId, title),
  chronosToggleSubtask: (id: number, done: number) => ipcRenderer.invoke('chronos:toggleSubtask', id, done),
  chronosDeleteSubtask: (id: number) => ipcRenderer.invoke('chronos:deleteSubtask', id),
  hermesChat: (message: string) => ipcRenderer.invoke('hermes:chat', message),
  hermesChatHistory: () => ipcRenderer.invoke('hermes:chatHistory'),
  hermesOverview: () => ipcRenderer.invoke('hermes:overview'),
  hermesLogHabit: (habitId: number) => ipcRenderer.invoke('hermes:logHabit', habitId),
  hermesLogGoal: (goalId: number, amount: number, note: string) => ipcRenderer.invoke('hermes:logGoal', goalId, amount, note),
  hestiaChat: (message: string) => ipcRenderer.invoke('hestia:chat', message),
  hestiaChatHistory: () => ipcRenderer.invoke('hestia:chatHistory'),
  hestiaOverview: () => ipcRenderer.invoke('hestia:overview'),
  hestiaLogEnergy: (level: number) => ipcRenderer.invoke('hestia:logEnergy', level),
  apolloChat: (message: string) => ipcRenderer.invoke('apollo:chat', message),
  apolloChatHistory: () => ipcRenderer.invoke('apollo:chatHistory'),
  apolloListNotes: () => ipcRenderer.invoke('apollo:listNotes'),
  apolloReadNote: (rel: string) => ipcRenderer.invoke('apollo:readNote', rel),
  onActivity: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, e: unknown) => cb(e)
    ipcRenderer.on('pantheon:activity', handler)
    return () => ipcRenderer.removeListener('pantheon:activity', handler)
  }
})
