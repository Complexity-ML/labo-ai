export type LaboTheme = 'labo-dark' | 'complexity-spectrum'

export const LABO_THEMES: Array<{
  id: LaboTheme
  name: string
  description: string
  colors: string[]
}> = [
  {
    id: 'labo-dark',
    name: 'LABO Dark',
    description: 'The restrained pastel workspace used by default.',
    colors: ['#91c7ad', '#91c3cc', '#aaa4d6'],
  },
  {
    id: 'complexity-spectrum',
    name: 'Complexity Spectrum',
    description: 'The green, cyan and violet identity of complexity-ai.fr.',
    colors: ['#6ee7b7', '#7dd3fc', '#c4b5fd', '#fcd34d', '#f9a8d4'],
  },
]

export type ApplicationSettingsRecord = Record<string, unknown> & {
  appearance?: Record<string, unknown> & { theme?: unknown; language?: unknown }
}

export function applicationSettingsRecord(value: unknown): ApplicationSettingsRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ApplicationSettingsRecord : {}
}

function validTheme(value: unknown): value is LaboTheme {
  return value === 'labo-dark' || value === 'complexity-spectrum'
}

export function readLaboTheme(): LaboTheme {
  const activeTheme = document.documentElement.dataset.laboTheme
  return validTheme(activeTheme) ? activeTheme : 'labo-dark'
}

export function applyLaboTheme(theme: LaboTheme): void {
  document.documentElement.dataset.laboTheme = theme
}

export async function readApplicationSettings(): Promise<{ authenticated: boolean; settings: ApplicationSettingsRecord }> {
  if (window.labo?.runtime === 'electron' && window.labo.loadDesktopState) {
    return { authenticated: true, settings: applicationSettingsRecord(await window.labo.loadDesktopState('settings')) }
  }
  if (window.labo?.runtime === 'web' && window.labo.loadWebWorkspace) {
    const workspace = await window.labo.loadWebWorkspace()
    return { authenticated: workspace.authenticated, settings: applicationSettingsRecord(workspace.settings) }
  }
  return { authenticated: false, settings: {} }
}

export async function saveApplicationSettings(settings: ApplicationSettingsRecord, authenticated: boolean): Promise<void> {
  if (window.labo?.runtime === 'electron' && window.labo.saveDesktopState) {
    await window.labo.saveDesktopState('settings', settings)
  } else if (window.labo?.runtime === 'web' && authenticated && window.labo.saveWebWorkspace) {
    await window.labo.saveWebWorkspace({ settings })
  }
}

export async function loadLaboTheme(): Promise<LaboTheme> {
  try {
    const { settings } = await readApplicationSettings()
    return validTheme(settings.appearance?.theme) ? settings.appearance.theme : 'labo-dark'
  } catch {
    return readLaboTheme()
  }
}

export async function saveLaboTheme(theme: LaboTheme): Promise<void> {
  applyLaboTheme(theme)
  try {
    const { authenticated, settings } = await readApplicationSettings()
    const nextSettings: ApplicationSettingsRecord = {
      ...settings,
      appearance: { ...applicationSettingsRecord(settings.appearance), theme },
    }
    await saveApplicationSettings(nextSettings, authenticated)
  } catch {
    // A visual preference must never prevent the workspace from opening.
  }
}

export async function initializeLaboTheme(): Promise<LaboTheme> {
  const theme = await loadLaboTheme()
  applyLaboTheme(theme)
  return theme
}
