import { contextBridge, ipcRenderer } from 'electron'
import type { AtomicRuntimePayload } from './atomic-runtime.js'
import type { AskLaboPayload } from './ask-labo.js'

const atomicRuntimeChannel = 'labo:atomic-runtime'
const askLaboChannel = 'labo:ask'
const openAISettingsChannel = 'labo:openai-settings'
const saveOpenAIKeyChannel = 'labo:openai-key-save'
const deleteOpenAIKeyChannel = 'labo:openai-key-delete'
const testOpenAIKeyChannel = 'labo:openai-key-test'
const exportFileChannel = 'labo:export-file'
const windowStateChannel = 'labo:window-state'
const loadDesktopStateChannel = 'labo:desktop-state-load'
const saveDesktopStateChannel = 'labo:desktop-state-save'

contextBridge.exposeInMainWorld('labo', {
  platform: process.platform,
  runtime: 'electron',
  runAtomic: (payload: AtomicRuntimePayload) => ipcRenderer.invoke(atomicRuntimeChannel, payload),
  askLabo: (payload: AskLaboPayload) => ipcRenderer.invoke(askLaboChannel, payload),
  getOpenAISettings: () => ipcRenderer.invoke(openAISettingsChannel),
  saveOpenAIKey: (apiKey: string) => ipcRenderer.invoke(saveOpenAIKeyChannel, { apiKey }),
  deleteOpenAIKey: () => ipcRenderer.invoke(deleteOpenAIKeyChannel),
  testOpenAIKey: () => ipcRenderer.invoke(testOpenAIKeyChannel),
  exportFile: (payload: { filename: string; content: string; kind: 'svg' | 'python' }) => ipcRenderer.invoke(exportFileChannel, payload),
  loadDesktopState: (scope: 'model' | 'training' | 'tokenizer') => ipcRenderer.invoke(loadDesktopStateChannel, { scope }),
  saveDesktopState: (scope: 'model' | 'training' | 'tokenizer', data: unknown) => ipcRenderer.invoke(saveDesktopStateChannel, { scope, data }),
  getWindowState: () => ipcRenderer.invoke(windowStateChannel),
  onWindowStateChange: (callback: (state: { fullScreen: boolean }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { fullScreen: boolean }) => callback(state)
    ipcRenderer.on(windowStateChannel, listener)
    return () => ipcRenderer.removeListener(windowStateChannel, listener)
  },
})
