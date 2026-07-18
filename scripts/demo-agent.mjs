import { app, BrowserWindow, ipcMain } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { askLabo } from '../dist-electron/ask-labo.js'
import { runAtomicRuntime } from '../dist-electron/atomic-runtime.js'
import { getOpenAISettingsStatus } from '../dist-electron/openai-credentials.js'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const keepOpen = process.argv.includes('--keep-open')
const prompt = 'Build a compact executable GPT-like question-answering chatbot with native LABO cards. Start from Token IDs, include token embedding, causal attention, a residual MLP, final normalization, a tied language-model head and greedy token decoding. Wire every compatible typed port, auto-arrange the graph, save it as Agent QA Demo, and run it.'

app.setName('LABO AI')

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(window, expression, timeout = 210_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await window.webContents.executeJavaScript(expression, true)
    if (value) return value
    await wait(250)
  }
  throw new Error(`Demo timed out waiting for: ${expression}`)
}

async function cue(window, title, detail, duration = 2600) {
  await window.webContents.executeJavaScript(`(() => {
    let cue = document.querySelector('#labo-demo-cue')
    if (!cue) {
      cue = document.createElement('div')
      cue.id = 'labo-demo-cue'
      cue.style.cssText = 'position:fixed;z-index:9999;left:50%;bottom:34px;transform:translateX(-50%);min-width:390px;max-width:720px;padding:13px 17px;border:1px solid rgba(98,169,255,.6);border-radius:9px;background:rgba(9,11,16,.94);box-shadow:0 16px 55px rgba(0,0,0,.65);text-align:center;pointer-events:none;font-family:Inter,sans-serif'
      document.body.append(cue)
    }
    cue.innerHTML = '<strong style="display:block;color:#e9f2ff;font-size:15px">' + ${JSON.stringify(title)} + '</strong><small style="display:block;margin-top:5px;color:#91a0b4;font:10px JetBrains Mono">' + ${JSON.stringify(detail)} + '</small>'
  })()`, true)
  await wait(duration)
}

await app.whenReady()
ipcMain.handle('labo:ask', (_event, payload) => askLabo(payload))
ipcMain.handle('labo:atomic-runtime', (_event, payload) => runAtomicRuntime(payload))
ipcMain.handle('labo:openai-settings', () => getOpenAISettingsStatus())

process.stderr.write('[demo] checking the saved OpenAI credential\n')
const settings = await getOpenAISettingsStatus()
if (!settings.configured) throw new Error('Add and verify an OpenAI API key in LABO AI before running the agent demo.')

const window = new BrowserWindow({
  show: false,
  width: 1440,
  height: 900,
  backgroundColor: '#08090b',
  title: 'LABO AI · 60 second demo',
  autoHideMenuBar: process.platform !== 'darwin',
  ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 15, y: 17 } } : {}),
  webPreferences: {
    preload: join(projectRoot, 'dist-electron', 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    partition: 'labo-agent-demo',
  },
})

try {
  process.stderr.write('[demo] loading LABO AI\n')
  await window.loadFile(join(projectRoot, 'dist', 'index.html'))
  window.show()
  window.focus()
  await waitFor(window, `document.querySelector('button[aria-label="Play model atoms"]') !== null`)
  await cue(window, 'LABO AI', 'Executable neural architectures, built from typed atomic cards.', 3200)

  await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Blank starter'))?.click()`, true)
  await cue(window, '1 · Blank workspace', 'The agent receives the current graph and the complete 100+ card catalog.')

  await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Ask LABO')))?.click()`, true)
  await waitFor(window, `document.querySelector('.ask-labo-key-heading')?.textContent.includes('Connected') === true`)
  await window.webContents.executeJavaScript(`(() => {
    [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Auto apply')?.click()
    [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Extend current')?.click()
  })()`, true)
  await cue(window, '2 · Ask the graph agent', 'Auto apply executes only locally valid typed operations.')

  await window.webContents.executeJavaScript(`(async () => {
    const textarea = document.querySelector('#ask-labo-request')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    const value = ${JSON.stringify(prompt)}
    for (let index = 1; index <= value.length; index += 4) {
      setter.call(textarea, value.slice(0, index))
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 12))
    }
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })()`, true)
  await wait(900)
  await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find((button) => button.textContent.includes('Propose graph changes')))?.click()`, true)
  process.stderr.write('[demo] agent request submitted; live planning may take up to three minutes\n')
  await cue(window, '3 · Tool-driven planning', 'The agent searches cards, adds nodes, wires ports, lays out, saves and runs.', 3400)
  await waitFor(window, `document.querySelector('.ask-labo-panel') === null || document.querySelector('.ask-labo-error') !== null`)
  const error = await window.webContents.executeJavaScript(`document.querySelector('.ask-labo-error')?.textContent.trim() ?? ''`, true)
  if (error) throw new Error(error)
  process.stderr.write('[demo] graph plan applied\n')
  await waitFor(window, `document.querySelectorAll('.architecture-node').length >= 5`)
  await cue(window, '4 · Executable graph', 'Typed elastics and topology-aware XY placement expose sequential and parallel paths.', 4200)

  await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'PyTorch'))?.click()`, true)
  await cue(window, '5 · Generated PyTorch', 'Every supported card maps to inspectable model code.', 4200)
  await window.webContents.executeJavaScript(`([...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Split'))?.click()`, true)

  const canPlay = await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Play model atoms"]')?.disabled === false`, true)
  if (canPlay) {
    await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Play model atoms"]')?.click()`, true)
    await cue(window, '6 · Atomic execution', 'Run the graph locally, inspect each atom, then rerun or step through it.', 3600)
    await waitFor(window, `['completed', 'failed'].includes(document.querySelector('.player-status')?.textContent.trim())`, 90_000)
    process.stderr.write('[demo] atomic execution finished\n')
  }

  await window.webContents.executeJavaScript(`document.querySelector('.model-preset-family > summary')?.click()`, true)
  await cue(window, 'Saved as Agent QA Demo', 'Workspaces persist locally; diagrams and PyTorch can be exported.', 5200)
  await window.webContents.executeJavaScript(`document.querySelector('#labo-demo-cue')?.remove()`, true)
  if (keepOpen) await new Promise(() => undefined)
  await wait(1800)
  process.stderr.write('[demo] complete\n')
} finally {
  if (!window.isDestroyed()) window.destroy()
  app.quit()
}
