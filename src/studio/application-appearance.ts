export const LABO_THEME_STORAGE_KEY = 'labo.application.theme.v1'

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

export function readLaboTheme(): LaboTheme {
  const activeTheme = document.documentElement.dataset.laboTheme
  if (activeTheme === 'labo-dark' || activeTheme === 'complexity-spectrum') return activeTheme
  if (window.labo?.runtime === 'web') return 'labo-dark'
  try {
    const stored = window.localStorage.getItem(LABO_THEME_STORAGE_KEY)
    return stored === 'complexity-spectrum' ? stored : 'labo-dark'
  } catch {
    return 'labo-dark'
  }
}

export function applyLaboTheme(theme: LaboTheme): void {
  document.documentElement.dataset.laboTheme = theme
  if (window.labo?.runtime === 'web') return
  try {
    window.localStorage.setItem(LABO_THEME_STORAGE_KEY, theme)
  } catch {
    // A visual preference must never prevent the workspace from opening.
  }
}

export function initializeLaboTheme(): void {
  applyLaboTheme(readLaboTheme())
}
