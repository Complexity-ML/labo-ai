import { useEffect, useState } from 'react'
import { applicationSettingsRecord, readApplicationSettings, saveApplicationSettings } from './application-appearance'

export type LaboLanguage = 'en' | 'fr'

const languageChangeEvent = 'labo-language-change'

function validLanguage(value: unknown): value is LaboLanguage {
  return value === 'en' || value === 'fr'
}

export function readLaboLanguage(): LaboLanguage {
  return document.documentElement.lang.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function applyLaboLanguage(language: LaboLanguage): void {
  document.documentElement.lang = language
  document.documentElement.dataset.laboLanguage = language
  window.dispatchEvent(new CustomEvent<LaboLanguage>(languageChangeEvent, { detail: language }))
}

export async function loadLaboLanguage(): Promise<LaboLanguage> {
  try {
    const { settings } = await readApplicationSettings()
    return validLanguage(settings.appearance?.language) ? settings.appearance.language : 'en'
  } catch {
    return readLaboLanguage()
  }
}

export async function saveLaboLanguage(language: LaboLanguage): Promise<void> {
  applyLaboLanguage(language)
  try {
    const { authenticated, settings } = await readApplicationSettings()
    await saveApplicationSettings({
      ...settings,
      appearance: { ...applicationSettingsRecord(settings.appearance), language },
    }, authenticated)
  } catch {
    // A language preference must never prevent the workspace from opening.
  }
}

export async function initializeLaboLanguage(): Promise<LaboLanguage> {
  const language = await loadLaboLanguage()
  applyLaboLanguage(language)
  return language
}

export function useLaboLanguage(): LaboLanguage {
  const [language, setLanguage] = useState<LaboLanguage>(readLaboLanguage)

  useEffect(() => {
    const update = (event: Event) => setLanguage((event as CustomEvent<LaboLanguage>).detail)
    window.addEventListener(languageChangeEvent, update)
    return () => window.removeEventListener(languageChangeEvent, update)
  }, [])

  return language
}
