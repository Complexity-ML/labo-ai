import { useEffect, useMemo, useState } from 'react'
import { Search, Settings2, X } from 'lucide-react'
import { LaboMark } from './LaboMark'
import './App.css'
import { ModelStudio } from './model/ModelStudio'
import { TokenizerStudio } from './TokenizerStudio'
import { TrainingStudio } from './training/TrainingStudio'
import { searchModelCards } from './model/card-search'
import './styles/desktop.scss'

type Workspace = 'model' | 'training' | 'tokenizer'

function App() {
  const [workspace, setWorkspace] = useState<Workspace>('model')
  const [askOpen, setAskOpen] = useState(false)
  const [studioSettingsOpen, setStudioSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [requestedCard, setRequestedCard] = useState<{ atomId: string; requestId: number }>()
  const [nativeFullScreen, setNativeFullScreen] = useState(false)
  const searchResults = useMemo(() => searchModelCards(searchQuery), [searchQuery])
  const platform = window.labo?.platform
  const runtimeClass = window.labo?.runtime === 'electron' ? ` runtime-electron runtime-${platform ?? 'desktop'}` : ''
  const searchShortcut = platform === 'darwin' ? '⌘K' : 'Ctrl+K'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      } else if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    let active = true
    void window.labo?.getWindowState?.().then((state) => { if (active) setNativeFullScreen(state.fullScreen) })
    const unsubscribe = window.labo?.onWindowStateChange?.((state) => setNativeFullScreen(state.fullScreen))
    return () => { active = false; unsubscribe?.() }
  }, [])

  return <main className={`app-shell workspace-${workspace}${runtimeClass}${nativeFullScreen ? ' native-fullscreen' : ''}`}>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><LaboMark /></span>
        <strong>LABO AI</strong>
        <span className="alpha-pill">ALPHA</span>
      </div>
      <nav className="studio-navigation" aria-label="LABO studios">
        <button aria-pressed={workspace === 'model'} onClick={() => { setWorkspace('model'); setStudioSettingsOpen(false) }}>Model Studio</button>
        <button aria-pressed={workspace === 'training'} onClick={() => { setWorkspace('training'); setAskOpen(false); setStudioSettingsOpen(false) }}>Training Studio</button>
        <button aria-pressed={workspace === 'tokenizer'} onClick={() => { setWorkspace('tokenizer'); setAskOpen(false); setStudioSettingsOpen(false) }}>Tokenizer Studio</button>
      </nav>
      <div className="header-actions">
        <button aria-label="Search model cards" className="ghost-button" onClick={() => setSearchOpen(true)}><Search size={14} /> Search <kbd>{searchShortcut}</kbd></button>
        <button aria-label="Open LABO settings" aria-pressed={askOpen || studioSettingsOpen} className="codex-button" onClick={() => {
          if (workspace === 'model') setAskOpen((current) => !current)
          else setStudioSettingsOpen((current) => !current)
        }}><Settings2 size={14} /> Settings</button>
      </div>
    </header>

    {workspace === 'model' && <ModelStudio askOpen={askOpen} onCloseAsk={() => setAskOpen(false)} onRequestedCardHandled={() => setRequestedCard(undefined)} requestedCard={requestedCard} />}
    {workspace === 'training' && <TrainingStudio onCloseSettings={() => setStudioSettingsOpen(false)} settingsOpen={studioSettingsOpen} />}
    {workspace === 'tokenizer' && <TokenizerStudio />}

    {workspace === 'tokenizer' && studioSettingsOpen && <div className="model-card-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setStudioSettingsOpen(false) }}>
      <section aria-label="Tokenizer Studio settings" aria-modal="true" className="model-card-modal studio-settings-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
        <header><div><span>TOKENIZER STUDIO</span><strong>Settings</strong></div><button aria-label="Close Tokenizer Studio settings" onClick={() => setStudioSettingsOpen(false)} type="button"><X size={14} /></button></header>
        <p className="model-card-modal-hint">Tokenizer cards are saved automatically for this LABO AI profile.</p>
        <footer><span /><button onClick={() => setStudioSettingsOpen(false)} type="button">Done</button></footer>
      </section>
    </div>}

    {searchOpen && <div className="card-search-backdrop">
      <section aria-label="Search cards" aria-modal="true" className="card-search-modal" role="dialog">
        <header><span><Search size={14} />Find a card</span><button aria-label="Close card search" onClick={() => setSearchOpen(false)}><X size={14} /></button></header>
        <input autoFocus aria-label="Natural language card search" onChange={(event) => setSearchQuery(event.target.value)} placeholder="Ex. convertir des logits en token généré…" value={searchQuery} />
        <div className="card-search-results">
          {searchQuery && searchResults.length === 0 && <p>No matching native card.</p>}
          {searchResults.map((result) => <button key={result.atomId} onClick={() => {
            setWorkspace('model')
            setRequestedCard({ atomId: result.atomId, requestId: Date.now() })
            setSearchOpen(false)
            setSearchQuery('')
          }}><strong>{result.label}</strong><small>{result.description}</small></button>)}
        </div>
      </section>
    </div>}
  </main>
}

export default App
