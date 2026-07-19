const invoke = window.__TAURI__.core.invoke
const listen = window.__TAURI__.event.listen
const button = document.querySelector('#install')
const stage = document.querySelector('#stage')
const version = document.querySelector('#version')
const message = document.querySelector('#message')
const progress = document.querySelector('#progress')

async function refresh() {
  try {
    const state = await invoke('setup_status')
    version.textContent = state.latestTag ? `Latest ${state.latestTag}` : `Installed ${state.installedTag || 'none'}`
    button.textContent = state.installedTag === state.latestTag ? 'Reinstall latest' : state.installedTag ? 'Update LABO AI' : 'Install latest'
  } catch (error) {
    version.textContent = 'GitHub check unavailable'
    message.textContent = String(error)
  }
}

listen('setup-progress', ({ payload }) => {
  stage.textContent = payload.stage
  message.textContent = payload.message
  progress.style.width = `${payload.percent}%`
})

button.addEventListener('click', async () => {
  button.disabled = true
  button.textContent = 'Installing…'
  try {
    const result = await invoke('install_latest')
    stage.textContent = 'Installed'
    version.textContent = result.tag
    message.textContent = 'LABO AI is installed and launching. Future updates are available from Settings.'
    progress.style.width = '100%'
    button.textContent = 'Installed'
  } catch (error) {
    stage.textContent = 'Failed'
    message.textContent = String(error)
    button.disabled = false
    button.textContent = 'Retry installation'
  }
})

refresh()
