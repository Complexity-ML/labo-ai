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

type SettingsRecord = Record<string, unknown> & {
  appearance?: Record<string, unknown> & { theme?: unknown }
}

function record(value: unknown): SettingsRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as SettingsRecord : {}
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

async function readSettings(): Promise<{ authenticated: boolean; settings: SettingsRecord }> {
  if (window.labo?.runtime === 'electron' && window.labo.loadDesktopState) {
    return { authenticated: true, settings: record(await window.labo.loadDesktopState('settings')) }
  }
  if (window.labo?.runtime === 'web' && window.labo.loadWebWorkspace) {
    const workspace = await window.labo.loadWebWorkspace()
    return { authenticated: workspace.authenticated, settings: record(workspace.settings) }
  }
  return { authenticated: false, settings: {} }
}

export async function loadLaboTheme(): Promise<LaboTheme> {
  try {
    const { settings } = await readSettings()
    return validTheme(settings.appearance?.theme) ? settings.appearance.theme : 'labo-dark'
  } catch {
    return readLaboTheme()
  }
}

export async function saveLaboTheme(theme: LaboTheme): Promise<void> {
  applyLaboTheme(theme)
  try {
    const { authenticated, settings } = await readSettings()
    const nextSettings: SettingsRecord = {
      ...settings,
      appearance: { ...record(settings.appearance), theme },
    }
    if (window.labo?.runtime === 'electron' && window.labo.saveDesktopState) {
      await window.labo.saveDesktopState('settings', nextSettings)
    } else if (window.labo?.runtime === 'web' && authenticated && window.labo.saveWebWorkspace) {
      await window.labo.saveWebWorkspace({ settings: nextSettings })
    }
  } catch {
    // A visual preference must never prevent the workspace from opening.
  }
}

export async function initializeLaboTheme(): Promise<LaboTheme> {
  const theme = await loadLaboTheme()
  applyLaboTheme(theme)
  return theme
}
