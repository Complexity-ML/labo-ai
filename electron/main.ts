import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rendererWebPreferences } from './security.js'
import { runAtomicRuntime, type AtomicRuntimePayload } from './atomic-runtime.js'
import { askLaboChannel, atomicRuntimeChannel, deleteOpenAIKeyChannel, openAISettingsChannel, saveOpenAIKeyChannel, testOpenAIKeyChannel } from './ipc-contract.js'
import { askLabo } from './ask-labo.js'
import { deleteOpenAIApiKey, getOpenAISettingsStatus, saveOpenAIApiKey, testOpenAIConnection } from './openai-credentials.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#08090b',
    title: 'LABO AI',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 17 },
    webPreferences: {
      ...rendererWebPreferences,
      preload: join(currentDirectory, 'preload.cjs'),
    },
  })

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  if (developmentUrl) {
    void window.loadURL(developmentUrl)
  } else {
    void window.loadFile(join(currentDirectory, '..', 'dist', 'index.html'))
  }

  return window
}

app.whenReady().then(() => {
  ipcMain.handle(atomicRuntimeChannel, (_event, payload: AtomicRuntimePayload) => runAtomicRuntime(payload))
  ipcMain.handle(askLaboChannel, (_event, payload) => askLabo(payload))
  ipcMain.handle(openAISettingsChannel, () => getOpenAISettingsStatus())
  ipcMain.handle(saveOpenAIKeyChannel, (_event, payload) => saveOpenAIApiKey(payload))
  ipcMain.handle(deleteOpenAIKeyChannel, () => deleteOpenAIApiKey())
  ipcMain.handle(testOpenAIKeyChannel, () => testOpenAIConnection())
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
