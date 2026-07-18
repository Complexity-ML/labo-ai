import { useState } from 'react'
import { FlaskConical, Search, Sparkles } from 'lucide-react'
import './App.css'
import { ModelStudio } from './model/ModelStudio'
import { TokenizerStudio } from './TokenizerStudio'
import { TrainingStudio } from './training/TrainingStudio'

type Workspace = 'model' | 'training' | 'tokenizer'

function App() {
  const [workspace, setWorkspace] = useState<Workspace>('model')
  const [askOpen, setAskOpen] = useState(false)
  const runtimeClass = window.labo?.runtime === 'electron' ? ' runtime-electron' : ''

  return <main className={`app-shell${runtimeClass}`}>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><FlaskConical size={17} /></span>
        <strong>LABO AI</strong>
        <span className="alpha-pill">ALPHA</span>
      </div>
      <nav className="studio-navigation" aria-label="LABO studios">
        <button aria-pressed={workspace === 'model'} onClick={() => setWorkspace('model')}>Model Studio</button>
        <button aria-pressed={workspace === 'training'} onClick={() => setWorkspace('training')}>Training Studio</button>
        <button aria-pressed={workspace === 'tokenizer'} onClick={() => setWorkspace('tokenizer')}>Tokenizer Studio</button>
      </nav>
      <div className="header-actions">
        <button className="ghost-button"><Search size={14} /> Search <kbd>⌘K</kbd></button>
        <button aria-pressed={askOpen} className="codex-button" onClick={() => {
          setWorkspace('model')
          setAskOpen((current) => !current)
        }}><Sparkles size={14} /> Ask LABO</button>
      </div>
    </header>

    {workspace === 'model' && <ModelStudio askOpen={askOpen} onCloseAsk={() => setAskOpen(false)} />}
    {workspace === 'training' && <TrainingStudio />}
    {workspace === 'tokenizer' && <TokenizerStudio />}
  </main>
}

export default App
