const invoke = window.__TAURI__.core.invoke
const listen = window.__TAURI__.event.listen
const button = document.querySelector('#install')
const stage = document.querySelector('#stage')
const version = document.querySelector('#version')
const message = document.querySelector('#message')
const progress = document.querySelector('#progress')
const log = document.querySelector('#log')

function appendLog(step, text) {
  const item = document.createElement('li')
  const time = document.createElement('time')
  const value = document.createElement('span')
  time.textContent = step
  value.textContent = text
  item.append(time, value)
  log.append(item)
  log.scrollTop = log.scrollHeight
}

async function refresh() {
  try {
    const state = await invoke('setup_status')
    version.textContent = state.latestTag ? `Latest ${state.latestTag}` : `Installed ${state.installedTag || 'none'}`
    button.disabled = state.installing
    button.textContent = state.installing ? 'Installing…' : state.installedTag === state.latestTag ? 'Reinstall latest' : state.installedTag ? 'Update LABO AI' : 'Install latest'
  } catch (error) {
    version.textContent = 'GitHub check unavailable'
    message.textContent = String(error)
  }
}

listen('setup-progress', ({ payload }) => {
  const failed = payload.stage === 'Failed'
  button.disabled = !failed
  button.textContent = failed ? 'Retry installation' : 'Installing…'
  stage.textContent = payload.stage
  message.textContent = payload.message
  progress.style.width = `${payload.percent}%`
  appendLog(`${payload.percent}% ${payload.stage}`, payload.message)
})

button.addEventListener('click', async () => {
  button.disabled = true
  button.textContent = 'Installing…'
  try {
    const result = await invoke('install_latest')
    if (result.setupRelaunched) {
      stage.textContent = 'Updating Setup'
      version.textContent = result.tag
      message.textContent = 'The verified latest Setup is taking over this installation.'
      appendLog('RELAUNCH', 'Closing this Setup and continuing in the newly verified helper.')
      return
    }
    stage.textContent = 'Installed'
    version.textContent = result.tag
    message.textContent = 'LABO AI is installed and launching. Future updates are available from Settings.'
    progress.style.width = '100%'
    button.textContent = 'Installed'
  } catch (error) {
    const detail = String(error)
    if (detail.includes('already installing')) {
      stage.textContent = 'Installing'
      message.textContent = 'The active installation is still running in this Setup window.'
    } else {
      stage.textContent = 'Failed'
      message.textContent = detail
      button.disabled = false
      button.textContent = 'Retry installation'
    }
  }
})

refresh()
