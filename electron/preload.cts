import { contextBridge, ipcRenderer } from 'electron'
import type { AtomicRuntimePayload } from './atomic-runtime.js'
import type { AskLaboPayload } from './ask-labo.js'

const atomicRuntimeChannel = 'labo:atomic-runtime'
const askLaboChannel = 'labo:ask'
const openAISettingsChannel = 'labo:openai-settings'
const saveOpenAIKeyChannel = 'labo:openai-key-save'
const deleteOpenAIKeyChannel = 'labo:openai-key-delete'
const testOpenAIKeyChannel = 'labo:openai-key-test'

contextBridge.exposeInMainWorld('labo', {
  platform: process.platform,
  runtime: 'electron',
  runAtomic: (payload: AtomicRuntimePayload) => ipcRenderer.invoke(atomicRuntimeChannel, payload),
  askLabo: (payload: AskLaboPayload) => ipcRenderer.invoke(askLaboChannel, payload),
  getOpenAISettings: () => ipcRenderer.invoke(openAISettingsChannel),
  saveOpenAIKey: (apiKey: string) => ipcRenderer.invoke(saveOpenAIKeyChannel, { apiKey }),
  deleteOpenAIKey: () => ipcRenderer.invoke(deleteOpenAIKeyChannel),
  testOpenAIKey: () => ipcRenderer.invoke(testOpenAIKeyChannel),
})
