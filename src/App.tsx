import { useEffect, useMemo, useState } from 'react'
import { Search, Settings2, X } from 'lucide-react'
import { LaboMark } from './LaboMark'
import './App.scss'
import { ModelStudio } from './model/ModelStudio'
import { TokenizerStudio } from './TokenizerStudio'
import { TrainingStudio } from './training/TrainingStudio'
import { searchModelCards } from './model/card-search'
import { searchOptimizers, searchTokenizerCards } from './studio-search'
import type { OptimizerDefinition } from './core/optimizer-ir'
import type { CustomTokenizerCard } from './tokenizer/custom-tokenizer-card'
import './styles/desktop.scss'

type Workspace = 'model' | 'training' | 'tokenizer'

function App() {
  const [workspace, setWorkspace] = useState<Workspace>('model')
  const [askOpen, setAskOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [requestedCard, setRequestedCard] = useState<{ atomId: string; requestId: number }>()
  const [requestedOptimizer, setRequestedOptimizer] = useState<{ optimizerId: string; requestId: number }>()
  const [requestedTokenizerCard, setRequestedTokenizerCard] = useState<{ cardId: string; kind: 'atom' | 'custom'; requestId: number }>()
  const [customOptimizers, setCustomOptimizers] = useState<OptimizerDefinition[]>([])
  const [customTokenizerCards, setCustomTokenizerCards] = useState<CustomTokenizerCard[]>([])
  const [nativeFullScreen, setNativeFullScreen] = useState(false)
  const searchResults = useMemo(() => workspace === 'model'
    ? searchModelCards(searchQuery).map((result) => ({ ...result, id: result.atomId, kind: 'model' as const }))
    : workspace === 'training' ? searchOptimizers(searchQuery, customOptimizers) : searchTokenizerCards(searchQuery, customTokenizerCards), [customOptimizers, customTokenizerCards, searchQuery, workspace])
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
        <button aria-pressed={workspace === 'model'} onClick={() => { setWorkspace('model'); setAskOpen(false) }}>Model Studio</button>
        <button aria-pressed={workspace === 'training'} onClick={() => { setWorkspace('training'); setAskOpen(false) }}>Training Studio</button>
        <button aria-pressed={workspace === 'tokenizer'} onClick={() => { setWorkspace('tokenizer'); setAskOpen(false) }}>Tokenizer Studio</button>
      </nav>
      <div className="header-actions">
        <button aria-label={`Search ${workspace === 'model' ? 'model cards' : workspace === 'training' ? 'optimizers' : 'tokenizer cards'}`} className="ghost-button" onClick={() => setSearchOpen(true)}><Search size={14} /> Search <kbd>{searchShortcut}</kbd></button>
        <button aria-label="Open LABO settings" aria-pressed={askOpen} className="codex-button" onClick={() => setAskOpen((current) => !current)}><Settings2 size={14} /> Settings</button>
      </div>
    </header>

    <div className="studio-host" hidden={workspace !== 'model'}><ModelStudio askOpen={askOpen} onCloseAsk={() => setAskOpen(false)} onRequestedCardHandled={() => setRequestedCard(undefined)} requestedCard={requestedCard} /></div>
    {workspace === 'training' && <TrainingStudio onCatalogChange={setCustomOptimizers} onRequestedOptimizerHandled={() => setRequestedOptimizer(undefined)} requestedOptimizer={requestedOptimizer} />}
    {workspace === 'tokenizer' && <TokenizerStudio onCatalogChange={setCustomTokenizerCards} onRequestedCardHandled={() => setRequestedTokenizerCard(undefined)} requestedCard={requestedTokenizerCard} />}

    {searchOpen && <div className="card-search-backdrop" onPointerDown={(event) => {
      if (event.target !== event.currentTarget) return
      setSearchOpen(false)
      setSearchQuery('')
    }}>
      <section aria-label="Search cards" aria-modal="true" className="card-search-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
        <header><span><Search size={14} />Find a card</span><button aria-label="Close card search" onClick={() => setSearchOpen(false)}><X size={14} /></button></header>
        <input autoFocus aria-label="Natural language card search" onChange={(event) => setSearchQuery(event.target.value)} placeholder={workspace === 'model' ? 'Ex. decode generated logits into a token…' : workspace === 'training' ? 'Ex. optimizer with momentum and weight decay…' : 'Ex. image tokenizer or byte-level decoder…'} value={searchQuery} />
        <div className="card-search-results">
          {searchQuery && searchResults.length === 0 && <p>No matching native card.</p>}
          {searchResults.map((result) => <button key={`${result.kind}-${result.id}`} onClick={() => {
            if (result.kind === 'model') setRequestedCard({ atomId: result.id, requestId: Date.now() })
            else if (result.kind === 'optimizer') setRequestedOptimizer({ optimizerId: result.id, requestId: Date.now() })
            else setRequestedTokenizerCard({ cardId: result.id, kind: result.kind === 'tokenizer-atom' ? 'atom' : 'custom', requestId: Date.now() })
            setSearchOpen(false)
            setSearchQuery('')
          }}><strong>{result.label}</strong><small>{result.description}</small></button>)}
        </div>
      </section>
    </div>}
  </main>
}

export default App
