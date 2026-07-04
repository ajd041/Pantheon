import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pantheon', {
  send: (message: string) => ipcRenderer.invoke('chat:send', message),
  history: () => ipcRenderer.invoke('chat:history'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s: Record<string, string>) => ipcRenderer.invoke('settings:set', s),
  pickVault: () => ipcRenderer.invoke('settings:pickVault'),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  chronosTasks: () => ipcRenderer.invoke('chronos:tasks'),
  chronosAddTask: (t: Record<string, unknown>) => ipcRenderer.invoke('chronos:addTask', t),
  chronosUpdateTask: (id: number, patch: Record<string, unknown>) => ipcRenderer.invoke('chronos:updateTask', id, patch),
  chronosEvents: (timeMin: string, timeMax: string) => ipcRenderer.invoke('chronos:events', timeMin, timeMax),
  chronosArchive: () => ipcRenderer.invoke('chronos:archive'),
  chronosChat: (message: string) => ipcRenderer.invoke('chronos:chat', message),
  chronosChatHistory: () => ipcRenderer.invoke('chronos:chatHistory'),
  chronosDeleteTask: (id: number) => ipcRenderer.invoke('chronos:deleteTask', id),
  chronosAddSubtask: (taskId: number, title: string) => ipcRenderer.invoke('chronos:addSubtask', taskId, title),
  chronosToggleSubtask: (id: number, done: number) => ipcRenderer.invoke('chronos:toggleSubtask', id, done),
  chronosDeleteSubtask: (id: number) => ipcRenderer.invoke('chronos:deleteSubtask', id),
  onActivity: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, e: unknown) => cb(e)
    ipcRenderer.on('pantheon:activity', handler)
    return () => ipcRenderer.removeListener('pantheon:activity', handler)
  }
})
