import { Database, Lightbulb, Settings2, SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

export function StudioSettingsModal({ children, onClose, studio, tips }: { children: ReactNode; onClose(): void; studio: string; tips: ReactNode }) {
  const [section, setSection] = useState<'general' | 'studio' | 'tips'>('general')
  const runtime = window.labo?.runtime

  return <div className="model-card-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label="LABO AI settings" aria-modal="true" className="model-card-modal studio-settings-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
      <header><div><span>LABO AI</span><strong>Settings</strong></div><button aria-label="Close LABO AI settings" onClick={onClose} type="button"><X size={14} /></button></header>
      <nav aria-label="Settings sections" className="studio-settings-navigation">
        <button aria-pressed={section === 'general'} onClick={() => setSection('general')} type="button"><Settings2 size={13} />General</button>
        <button aria-pressed={section === 'studio'} onClick={() => setSection('studio')} type="button"><SlidersHorizontal size={13} />{studio}</button>
        <button aria-pressed={section === 'tips'} onClick={() => setSection('tips')} type="button"><Lightbulb size={13} />Tips</button>
      </nav>
      {section === 'general' ? <div className="studio-settings-general">
        <article><Database size={15} /><div><strong>Private automatic save</strong><p>{runtime === 'web' ? 'Signed-in workspaces are stored in the account-scoped server database. Guest work is temporary.' : runtime === 'electron' ? 'Workspaces, cards and optimizers are stored in the persistent local SQLite profile.' : 'This development preview keeps only temporary browser state.'}</p></div></article>
        <article><Settings2 size={15} /><div><strong>Shared defaults, private creations</strong><p>Built-in cards and presets are read-only defaults. Everything you create belongs only to the current user profile.</p></div></article>
        {runtime === 'web' && <a className="studio-settings-account-link" href="/dashboard/settings" target="_top">Manage account and private data</a>}
      </div> : section === 'studio' ? <div className="studio-settings-context">{children}</div> : <div className="studio-settings-tips">{tips}</div>}
      <footer><span /><button onClick={onClose} type="button">Done</button></footer>
    </section>
  </div>
}
