import { app, BrowserWindow, dialog, ipcMain, shell, type BrowserWindowConstructorOptions } from 'electron'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rendererWebPreferences } from './security.js'
import { runAtomicRuntime, type AtomicRuntimePayload } from './atomic-runtime.js'
import { askLaboChannel, atomicRuntimeChannel, chatGPTSessionChannel, connectChatGPTChannel, deleteOpenAIKeyChannel, desktopUpdateStatusChannel, disconnectChatGPTChannel, exportFileChannel, launchDesktopUpdateChannel, loadDesktopStateChannel, openAISettingsChannel, openDesktopSetupChannel, saveDesktopStateChannel, saveOpenAIKeyChannel, testOpenAIKeyChannel, windowStateChannel } from './ipc-contract.js'
import { askLabo } from './ask-labo.js'
import { loadDesktopState, saveDesktopState } from './desktop-state.js'
import { deleteOpenAIApiKey, getOpenAISettingsStatus, saveOpenAIApiKey, testOpenAIConnection } from './openai-credentials.js'
import { desktopSetupReleaseUrl, getDesktopUpdateStatus, launchDesktopUpdate } from './desktop-updates.js'
import { CodexAppServer } from './chatgpt-session.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const chatGPT = new CodexAppServer((url) => shell.openExternal(url), app.getVersion())

function createMainWindow(): BrowserWindow {
  const platformFrame: BrowserWindowConstructorOptions = process.platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 15, y: 17 } }
    : { titleBarStyle: 'default', autoHideMenuBar: true }
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#08090b',
    title: 'LABO AI',
    ...platformFrame,
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

  const publishWindowState = () => window.webContents.send(windowStateChannel, { fullScreen: window.isFullScreen() })
  window.on('enter-full-screen', publishWindowState)
  window.on('leave-full-screen', publishWindowState)

  return window
}

app.whenReady().then(() => {
  ipcMain.handle(atomicRuntimeChannel, (_event, payload: AtomicRuntimePayload) => runAtomicRuntime(payload))
  ipcMain.handle(askLaboChannel, async (_event, payload) => {
    const session = await chatGPT.status()
    return session.connected ? chatGPT.ask(payload) : askLabo(payload)
  })
  ipcMain.handle(openAISettingsChannel, () => getOpenAISettingsStatus())
  ipcMain.handle(saveOpenAIKeyChannel, (_event, payload) => saveOpenAIApiKey(payload))
  ipcMain.handle(deleteOpenAIKeyChannel, () => deleteOpenAIApiKey())
  ipcMain.handle(testOpenAIKeyChannel, () => testOpenAIConnection())
  ipcMain.handle(chatGPTSessionChannel, () => chatGPT.status())
  ipcMain.handle(connectChatGPTChannel, () => chatGPT.connect())
  ipcMain.handle(disconnectChatGPTChannel, () => chatGPT.disconnect())
  ipcMain.handle(windowStateChannel, (event) => ({ fullScreen: BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false }))
  ipcMain.handle(loadDesktopStateChannel, (_event, payload: { scope?: unknown }) => loadDesktopState(app.getPath('userData'), payload?.scope))
  ipcMain.handle(saveDesktopStateChannel, (_event, payload: { scope?: unknown; data?: unknown }) => saveDesktopState(app.getPath('userData'), payload?.scope, payload?.data))
  ipcMain.handle(desktopUpdateStatusChannel, () => getDesktopUpdateStatus(app.getPath('userData'), app.getVersion()))
  ipcMain.handle(launchDesktopUpdateChannel, async () => {
    const result = await launchDesktopUpdate(app.getPath('userData'))
    setTimeout(() => app.quit(), 350)
    return result
  })
  ipcMain.handle(openDesktopSetupChannel, () => shell.openExternal(desktopSetupReleaseUrl))
  ipcMain.handle(exportFileChannel, async (event, payload: { filename?: unknown; content?: unknown; kind?: unknown }) => {
    if (typeof payload?.filename !== 'string' || typeof payload.content !== 'string' || !['svg', 'python'].includes(String(payload.kind)) || payload.content.length > 10_000_000) throw new Error('Invalid LABO export payload')
    const extension = payload.kind === 'svg' ? 'svg' : 'py'
    const filename = payload.filename.replace(/[^A-Za-z0-9._-]+/g, '-').replace(new RegExp(`\\.${extension}$`, 'i'), '') + `.${extension}`
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const options = { defaultPath: filename, filters: [{ name: payload.kind === 'svg' ? 'SVG diagram' : 'Python source', extensions: [extension] }] }
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, payload.content, 'utf8')
    return { saved: true, path: result.filePath }
  })
  createMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => chatGPT.stop())
