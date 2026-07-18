import { useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, Braces, Check, Code2, Cpu, PackageCheck, Pause, Play, Square, StepForward, Trash2 } from 'lucide-react'
import { AtomicPlayer, type AtomicPlayerSnapshot, type AtomExecutionResult } from './core/atomic-player'
import {
  addTokenizerStep,
  compileTokenizer,
  removeTokenizerStep,
  tokenizerAtomDefinitions,
  tokenizerAtomMetadata,
  updateTokenizerStepSettings,
  type TokenizerStep,
  type TokenizerTarget,
} from './core/tokenizer-ir'
import { researchBpePreset } from './core/tokenizer-presets'

type TokenizerView = 'blocks' | 'split'

function formatSetting(value: string | number | boolean | string[]): string {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

async function executeTokenizerIrAtom(step: TokenizerStep): Promise<{ summary: string }> {
  if (step.atom === 'unicode-normalize') {
    const form = String(step.settings.form) as 'NFC' | 'NFD' | 'NFKC' | 'NFKD'
    return { summary: `Café normalized with ${form}: ${'Cafe\u0301'.normalize(form)}` }
  }
  if (step.atom === 'byte-level-pretokenize') {
    return { summary: `UTF-8 bytes: ${new TextEncoder().encode('LABO AI').length}` }
  }
  if (step.atom === 'bpe-model') {
    if (!step.settings.unkToken) throw new Error('BPE model requires unkToken')
    return { summary: `BPE model contract: unk=${String(step.settings.unkToken)}` }
  }
  if (step.atom === 'bpe-trainer') {
    const vocabSize = Number(step.settings.vocabSize)
    if (!Number.isInteger(vocabSize) || vocabSize <= 0) throw new Error('BPE trainer requires a positive integer vocabSize')
    return { summary: `BPE trainer contract: ${vocabSize} entries` }
  }
  return { summary: `Byte-level round-trip: ${new TextDecoder().decode(new TextEncoder().encode('LABO AI'))}` }
}

export function TokenizerStudio() {
  const [pipeline, setPipeline] = useState(researchBpePreset)
  const [view, setView] = useState<TokenizerView>('split')
  const [target, setTarget] = useState<TokenizerTarget>('python')
  const [selectedId, setSelectedId] = useState(pipeline.steps[0]?.id ?? '')
  const [playerSnapshot, setPlayerSnapshot] = useState<AtomicPlayerSnapshot>({
    status: 'idle', currentAtomId: pipeline.steps[0]?.id,
    results: pipeline.steps.map((step) => ({ atomId: step.id, status: 'pending' })),
  })
  const playerRef = useRef<AtomicPlayer | null>(null)
  const code = useMemo(() => compileTokenizer(pipeline, target), [pipeline, target])
  const selected = pipeline.steps.find((step) => step.id === selectedId) ?? pipeline.steps[0]
  const trainer = pipeline.steps.find((step) => step.atom === 'bpe-trainer')
  const vocabSize = Number(trainer?.settings.vocabSize ?? 0)

  useEffect(() => {
    const player = new AtomicPlayer(
      pipeline.steps.map((step) => step.id),
      async (atomId) => executeTokenizerIrAtom(pipeline.steps.find((step) => step.id === atomId)!),
    )
    playerRef.current = player
    return player.subscribe(setPlayerSnapshot)
  }, [pipeline])

  const deleteSelected = () => {
    if (!selected) return
    const next = removeTokenizerStep(pipeline, selected.id)
    setPipeline(next)
    setSelectedId(next.steps[0]?.id ?? '')
  }

  const addAtom = (atom: TokenizerStep['atom']) => {
    const next = addTokenizerStep(pipeline, atom)
    setPipeline(next)
    setSelectedId(next.steps.at(-1)!.id)
  }

  return (
    <>
      <section className="workspace-toolbar">
        <div className="view-switcher" aria-label="Tokenizer editor view">
          <button aria-pressed={view === 'blocks'} onClick={() => setView('blocks')}><Blocks size={14} />Blocks</button>
          <button aria-pressed={view === 'split'} onClick={() => setView('split')}><Code2 size={14} />Split</button>
        </div>
        <strong className="workspace-name">{pipeline.name}</strong>
        <div className="target-switcher" aria-label="Code target">
          <button aria-pressed={target === 'python'} onClick={() => setTarget('python')}><Braces size={13} />Python</button>
          <button aria-pressed={target === 'rust'} onClick={() => setTarget('rust')}><Braces size={13} />Rust</button>
        </div>
        <div className="atomic-player-controls" aria-label="Atomic pipeline player">
          <button aria-label="Play atomic pipeline" onClick={() => void playerRef.current?.play()}><Play size={13} /></button>
          <button aria-label="Pause atomic pipeline" onClick={() => playerRef.current?.pause()}><Pause size={13} /></button>
          <button aria-label="Step one atom" onClick={() => void playerRef.current?.step()}><StepForward size={13} /></button>
          <button aria-label="Stop atomic pipeline" onClick={() => playerRef.current?.stop()}><Square size={12} /></button>
          <span className={`player-status status-${playerSnapshot.status}`}>{playerSnapshot.status}</span>
        </div>
      </section>

      <div className="workspace-grid tokenizer-workspace">
        <aside className="block-library">
          <div className="panel-heading"><Blocks size={14} /><span>TOKENIZER ATOMS</span></div>
          {Object.entries(tokenizerAtomDefinitions).map(([atom, metadata]) => {
            return (
              <button aria-label={`Add ${metadata.label}`} className="library-block tokenizer-library-block" key={atom} onClick={() => addAtom(atom as TokenizerStep['atom'])}>
                <span className="block-glyph glyph-transforms" />
                <span><strong>{metadata.label}</strong><small>{metadata.category}</small></span>
              </button>
            )
          })}
        </aside>

        <section className={`editor-grid tokenizer-editor view-${view}`}>
          <div className="canvas-panel">
            <div className="panel-tab"><Blocks size={13} /> tokenizer.pipeline</div>
            <div className="tokenizer-canvas">
              {pipeline.steps.map((step, index) => {
                const metadata = tokenizerAtomMetadata[step.atom]
                return (
                  <button
                    aria-label={`Select ${metadata.label}`}
                    className={`tokenizer-atom ${selectedId === step.id ? 'selected' : ''} status-${playerSnapshot.results.find((result) => result.atomId === step.id)?.status ?? 'pending'}`}
                    key={step.id}
                    onClick={() => setSelectedId(step.id)}
                  >
                    <span className="atom-order">{String(index + 1).padStart(2, '0')}</span>
                    <span className="node-type">{metadata.category}</span>
                    <strong>{metadata.label}</strong>
                    <small>{Object.entries(step.settings).map(([key, value]) => `${key}: ${formatSetting(value)}`).join(' · ') || 'no settings'}</small>
                  </button>
                )
              })}
            </div>
          </div>

          {view === 'split' && (
            <div className="code-panel">
              <div className="panel-tab"><Code2 size={13} /> tokenizer.{target === 'python' ? 'py' : 'rs'} <span>GENERATED</span></div>
              <pre className="code-editor"><code>{code}</code></pre>
            </div>
          )}
        </section>

        <aside className="inspector">
          <div className="panel-heading"><Cpu size={14} /><span>ATOM INSPECTOR</span></div>
          {selected && <TokenizerAtomInspector
            onDelete={deleteSelected}
            onSettingChange={(key, value) => setPipeline((current) => updateTokenizerStepSettings(current, selected.id, { [key]: value }))}
            result={playerSnapshot.results.find((result) => result.atomId === selected.id)}
            step={selected}
          />}
          <section className="equivalence-card tokenizer-artifact-card">
            <div className="equivalence-title"><PackageCheck size={14} /> Artifact contract</div>
            <div className="check-row"><span>Vocabulary size</span><b>{vocabSize.toLocaleString('en-US')}</b></div>
            <div className="check-row"><span>Steps</span><b>{pipeline.steps.length}</b></div>
            <div className="check-row"><span>Typed links</span><b>{pipeline.links.length}</b></div>
            <div className="check-row"><span>Python lowering</span><b className="passed">READY</b></div>
            <div className="check-row"><span>Rust lowering</span><b className="passed">READY</b></div>
          </section>
        </aside>
      </div>

      <footer className="statusbar">
        <span><span className="status-dot" /> Tokenizer IR valid</span>
        <span>{pipeline.steps.length} atoms · {pipeline.links.length} typed links</span>
        <span className="status-spacer" />
        <span>{target} backend</span>
        <span>LABO Runtime · local</span>
      </footer>
    </>
  )
}

function TokenizerAtomInspector({
  step,
  result,
  onDelete,
  onSettingChange,
}: {
  step: TokenizerStep
  result?: AtomExecutionResult
  onDelete(): void
  onSettingChange(key: string, value: string | number | boolean | string[]): void
}) {
  const metadata = tokenizerAtomMetadata[step.atom]
  return (
    <>
      <section className="inspector-section">
        <div className="section-title">Selection</div>
        <div className="selection-card">
          <span className="selection-icon"><Blocks size={15} /></span>
          <div><strong>{metadata.label}</strong><small>{step.atom}</small></div>
        </div>
      </section>
      <section className="inspector-section">
        <div className="section-title">Atomic settings</div>
        <div className="atomic-settings">
          {Object.entries(step.settings).map(([key, value]) => (
            <label key={key}>
              <span>{key}</span>
              {typeof value === 'number' ? (
                <input aria-label={key} onChange={(event) => onSettingChange(key, Number(event.target.value))} type="number" value={value} />
              ) : typeof value === 'boolean' ? (
                <input aria-label={key} checked={value} onChange={(event) => onSettingChange(key, event.target.checked)} type="checkbox" />
              ) : (
                <input
                  aria-label={key}
                  onChange={(event) => onSettingChange(key, Array.isArray(value) ? event.target.value.split(',').map((item) => item.trim()) : event.target.value)}
                  type="text"
                  value={formatSetting(value)}
                />
              )}
            </label>
          ))}
        </div>
        <button aria-label="Delete selected tokenizer atom" className="delete-atom-button" onClick={onDelete}><Trash2 size={13} />Delete atom</button>
      </section>
      <section className="inspector-section contract-section">
        <div className="contract-row"><span><Check size={12} />Registry lowering</span><strong>Defined</strong></div>
        <div className="contract-row"><span>Execution</span><strong>{result?.status ?? 'pending'}</strong></div>
        {result?.summary && <p className="execution-summary">{result.summary}</p>}
        {result?.error && <p className="execution-error">{result.error}</p>}
      </section>
    </>
  )
}
