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
  const navigation = [
    { id: 'general', label: 'General', icon: <Settings2 size={13} /> },
    { id: 'workspaces', label: 'Workspaces', icon: <FolderKanban size={13} /> },
    { id: 'agent', label: 'Agent', icon: <Sparkles size={13} /> },
    { id: 'studio', label: 'Studio', icon: <SlidersHorizontal size={13} /> },
    { id: 'tips', label: 'Tips', icon: <Lightbulb size={13} /> },
  ]

  return createPortal(<div className="model-card-modal-backdrop studio-settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label="LABO AI settings" aria-modal="true" className="model-card-modal studio-settings-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
      <header><div><span>LABO AI</span><strong>Settings</strong></div><button aria-label="Close LABO AI settings" onClick={onClose} type="button"><X size={14} /></button></header>
      <nav aria-label="Settings sections" className="studio-settings-navigation">
        {navigation.map((section) => <button aria-pressed={sectionId === section.id} key={section.id} onClick={() => setSectionId(section.id)} type="button">{section.icon}{section.label}</button>)}
      </nav>
      <div className="studio-settings-body">
        {sectionId === 'general' ? <div className="studio-settings-general">
          <article><Database size={15} /><div><strong>Private automatic save</strong><p>{runtime === 'web' ? 'Signed-in workspaces are stored in the account-scoped server database. Guest work is temporary.' : runtime === 'electron' ? 'Workspaces, cards and optimizers are stored in the persistent local SQLite profile.' : 'This development preview keeps only temporary browser state.'}</p></div></article>
          <article><Settings2 size={15} /><div><strong>Shared defaults, private creations</strong><p>Built-in cards and presets are read-only defaults. Everything you create belongs only to the current user profile.</p></div></article>
          <DesktopUpdateSettings />
          {runtime === 'web' && <a className="studio-settings-account-link" href="/dashboard/settings" target="_top">Manage account and private data</a>}
        </div> : <div className={`studio-settings-context studio-settings-section-${sectionId}`}>{sectionContent[sectionId] ?? <div className="studio-settings-empty"><strong>{navigation.find((section) => section.id === sectionId)?.label}</strong><p>These settings use the shared LABO AI defaults in this studio.</p></div>}</div>}
      </div>
      <footer><span /><button onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>, document.body)
}
