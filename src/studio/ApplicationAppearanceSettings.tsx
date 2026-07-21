import { Check, MonitorCog, Palette } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LABO_THEMES, loadLaboTheme, readLaboTheme, saveLaboTheme, type LaboTheme } from './application-appearance'

export function ApplicationAppearanceSettings() {
  const [theme, setTheme] = useState<LaboTheme>(readLaboTheme)

  useEffect(() => {
    let active = true
    void loadLaboTheme().then((storedTheme) => { if (active) setTheme(storedTheme) })
    return () => { active = false }
  }, [])

  const selectTheme = (nextTheme: LaboTheme) => {
    setTheme(nextTheme)
    void saveLaboTheme(nextTheme)
  }

  return <section aria-label="Application appearance" className="application-appearance-settings">
    <header>
      <span><Palette size={15} /></span>
      <div><strong>Workspace colour</strong><p>Choose one palette for the complete LABO AI application.</p></div>
    </header>
    <div className="application-theme-grid">
      {LABO_THEMES.map((candidate) => <button aria-label={`Use ${candidate.name} theme`} aria-pressed={theme === candidate.id} key={candidate.id} onClick={() => selectTheme(candidate.id)} type="button">
        <span className="application-theme-preview" data-theme-preview={candidate.id}>{candidate.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
        <span className="application-theme-copy"><strong>{candidate.name}</strong><small>{candidate.description}</small></span>
        <span className="application-theme-check">{theme === candidate.id ? <Check size={14} /> : null}</span>
      </button>)}
    </div>
    <footer><MonitorCog size={13} /><span>Applied across Model, Training and Tokenizer Studio.</span></footer>
  </section>
}
