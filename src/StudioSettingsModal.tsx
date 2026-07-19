import { Database, Settings2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export interface StudioSettingsSection {
  id: string
  label: string
  icon: ReactNode
  content: ReactNode
}

export function StudioSettingsModal({ onClose, sections }: { onClose(): void; sections: StudioSettingsSection[] }) {
  const [sectionId, setSectionId] = useState('general')
  const runtime = window.labo?.runtime
  const activeSection = sections.find((section) => section.id === sectionId)

  return <div className="model-card-modal-backdrop studio-settings-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label="LABO AI settings" aria-modal="true" className="model-card-modal studio-settings-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
      <header><div><span>LABO AI</span><strong>Settings</strong></div><button aria-label="Close LABO AI settings" onClick={onClose} type="button"><X size={14} /></button></header>
      <nav aria-label="Settings sections" className="studio-settings-navigation">
        <button aria-pressed={sectionId === 'general'} onClick={() => setSectionId('general')} type="button"><Settings2 size={13} />General</button>
        {sections.map((section) => <button aria-pressed={sectionId === section.id} key={section.id} onClick={() => setSectionId(section.id)} type="button">{section.icon}{section.label}</button>)}
      </nav>
      <div className="studio-settings-body">
        {sectionId === 'general' ? <div className="studio-settings-general">
          <article><Database size={15} /><div><strong>Private automatic save</strong><p>{runtime === 'web' ? 'Signed-in workspaces are stored in the account-scoped server database. Guest work is temporary.' : runtime === 'electron' ? 'Workspaces, cards and optimizers are stored in the persistent local SQLite profile.' : 'This development preview keeps only temporary browser state.'}</p></div></article>
          <article><Settings2 size={15} /><div><strong>Shared defaults, private creations</strong><p>Built-in cards and presets are read-only defaults. Everything you create belongs only to the current user profile.</p></div></article>
          {runtime === 'web' && <a className="studio-settings-account-link" href="/dashboard/settings" target="_top">Manage account and private data</a>}
        </div> : <div className={`studio-settings-context studio-settings-section-${activeSection?.id ?? 'unknown'}`}>{activeSection?.content}</div>}
      </div>
      <footer><span /><button onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>
}
