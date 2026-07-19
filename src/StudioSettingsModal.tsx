import { Database, FolderKanban, Lightbulb, Settings2, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useState, type ReactNode } from 'react'
import { DesktopUpdateSettings } from './DesktopUpdateSettings'

export interface StudioSettingsSection {
  id: string
  label: string
  icon: ReactNode
  content: ReactNode
}

export function StudioSettingsModal({ onClose, sections }: { onClose(): void; sections: StudioSettingsSection[] }) {
  const [sectionId, setSectionId] = useState('general')
  const runtime = window.labo?.runtime
  const sectionContent = Object.fromEntries(sections.map((section) => [section.id, section.content]))
  const sectionDescriptions: Record<string, string> = {
    general: 'Storage, privacy and desktop updates.',
    workspaces: 'Save, restore and compare your private graphs.',
    agent: 'Choose how Ask LABO plans and applies changes.',
    studio: 'Options and presets for the active studio.',
    tips: 'Shortcuts and gestures for faster graph editing.',
  }
  const defaultNavigation = [
    { id: 'general', label: 'General', icon: <Settings2 size={13} /> },
    { id: 'workspaces', label: 'Workspaces', icon: <FolderKanban size={13} /> },
    { id: 'agent', label: 'Agent', icon: <Sparkles size={13} /> },
    { id: 'studio', label: 'Studio', icon: <SlidersHorizontal size={13} /> },
    { id: 'tips', label: 'Tips', icon: <Lightbulb size={13} /> },
  ]
  const customSections = new Map(sections.map((section) => [section.id, section]))
  const navigation = defaultNavigation.map((section) => customSections.get(section.id) ?? section)
  const activeSection = navigation.find((section) => section.id === sectionId) ?? navigation[0]
  const fallbackCopy: Record<string, { title: string; body: string }> = {
    workspaces: { title: 'Private workspace', body: 'The active studio saves its current draft automatically for this profile.' },
    agent: { title: 'Shared agent preferences', body: 'Ask LABO uses the same private credentials and review defaults throughout the application.' },
    studio: { title: 'Active studio', body: 'This studio currently uses the shared LABO AI defaults.' },
    tips: { title: 'Studio shortcuts', body: 'Use the same selection, editing and keyboard conventions throughout LABO AI.' },
  }

  return createPortal(<div className="model-card-modal-backdrop studio-settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label="LABO AI settings" aria-modal="true" className="model-card-modal studio-settings-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
      <header className="studio-settings-header"><div><span>LABO AI / PREFERENCES</span><strong>Settings</strong><p>Configure this private workspace without leaving the studio.</p></div><button aria-label="Close LABO AI settings" onClick={onClose} type="button"><X size={15} /></button></header>
      <div className="studio-settings-layout">
        <nav aria-label="Settings sections" className="studio-settings-navigation">
          <small>Configuration</small>
          {navigation.map((section) => <button aria-label={section.label} aria-pressed={sectionId === section.id} key={section.id} onClick={() => setSectionId(section.id)} type="button"><span>{section.icon}</span><strong>{section.label}</strong></button>)}
        </nav>
        <main className="studio-settings-panel">
          <div className="studio-settings-section-heading"><span>{activeSection.icon}</span><div><small>Settings</small><h2>{activeSection.label}</h2><p>{sectionDescriptions[activeSection.id]}</p></div></div>
          <div className="studio-settings-body">
            {sectionId === 'general' ? <div className="studio-settings-general">
              <article><Database size={16} /><div><strong>Private automatic save</strong><p>{runtime === 'web' ? 'Signed-in workspaces are stored in the account-scoped server database. Guest work is temporary.' : runtime === 'electron' ? 'Workspaces, cards and optimizers are stored in the persistent local SQLite profile.' : 'This development preview keeps only temporary browser state.'}</p></div></article>
              <article><Settings2 size={16} /><div><strong>Shared defaults, private creations</strong><p>Built-in cards and presets are read-only defaults. Everything you create belongs only to the current user profile.</p></div></article>
              <DesktopUpdateSettings />
              {runtime === 'web' && <a className="studio-settings-account-link" href="/dashboard/settings" target="_top">Manage account and private data</a>}
            </div> : <div className={`studio-settings-context studio-settings-section-${sectionId}`}>{sectionContent[sectionId] ?? <div className="studio-settings-empty"><strong>{fallbackCopy[sectionId]?.title ?? activeSection.label}</strong><p>{fallbackCopy[sectionId]?.body ?? 'These settings use the shared LABO AI defaults in this studio.'}</p></div>}</div>}
          </div>
        </main>
      </div>
      <footer><span>Changes are saved automatically for this profile.</span><button onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>, document.body)
}
