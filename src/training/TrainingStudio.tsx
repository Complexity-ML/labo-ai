import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Blocks, Braces, Cpu, Lightbulb, Pencil, Play, Plus, Settings2, SplitSquareHorizontal, Trash2 } from 'lucide-react'
import { compileOptimizer, createOptimizerConfig, optimizerRegistry, type OptimizerConfig, type OptimizerDefinition, type OptimizerValue } from '../core/optimizer-ir'
import { OptimizerCreator } from './OptimizerCreator'
import { parseTrainingWorkspace } from './training-workspace'
import { StudioSettingsModal } from '../StudioSettingsModal'

function formatValue(value: OptimizerValue): string {
  if (Array.isArray(value)) return value.map((item) => item === null ? 'None' : String(item)).join(', ')
  if (value === null) return 'None'
  return String(value)
}

export function TrainingStudio({ settingsOpen = false, onCatalogChange = () => undefined, onCloseSettings = () => undefined, onRequestedOptimizerHandled = () => undefined, requestedOptimizer }: { settingsOpen?: boolean; onCatalogChange?: (optimizers: OptimizerDefinition[]) => void; onCloseSettings?: () => void; onRequestedOptimizerHandled?: () => void; requestedOptimizer?: { optimizerId: string; requestId: number } }) {
  const [config, setConfig] = useState<OptimizerConfig>(() => createOptimizerConfig('adamw'))
  const [view, setView] = useState<'graph' | 'pytorch' | 'split'>('split')
  const [interactionMode, setInteractionMode] = useState<'use' | 'edit'>('use')
  const [customOptimizers, setCustomOptimizers] = useState<OptimizerDefinition[]>([])
  const [creatorOpen, setCreatorOpen] = useState(false)
  const [editingOptimizer, setEditingOptimizer] = useState<OptimizerDefinition>()
  const [storageReady, setStorageReady] = useState(false)
  const [webAuthenticated, setWebAuthenticated] = useState(false)
  const [optimizerMenu, setOptimizerMenu] = useState<{ optimizerId: string; x: number; y: number }>()
  const interactedRef = useRef(false)
  const definitions = useMemo(() => ({ ...optimizerRegistry, ...Object.fromEntries(customOptimizers.map((optimizer) => [optimizer.id, optimizer])) }), [customOptimizers])
  const definition = definitions[config.kind]
  const code = useMemo(() => ['import torch', '', compileOptimizer(config, 'model.parameters()', definitions), ''].join('\n'), [config, definitions])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let stored
      if (window.labo?.runtime === 'electron' && window.labo.loadDesktopState) {
        stored = parseTrainingWorkspace(await window.labo.loadDesktopState('training'))
      } else if (window.labo?.runtime === 'web' && window.labo.loadWebWorkspace) {
        const result = await window.labo.loadWebWorkspace()
        const authenticated = Boolean(result && typeof result === 'object' && result.authenticated)
        if (!cancelled) setWebAuthenticated(authenticated)
        if (authenticated) stored = parseTrainingWorkspace(result.training)
      }
      if (!cancelled && stored && !interactedRef.current) {
        setCustomOptimizers(stored.customOptimizers)
        setConfig(stored.config)
      }
      if (!cancelled) setStorageReady(true)
    }
    void load().catch(() => { if (!cancelled) setStorageReady(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!storageReady) return
    const workspace = { config, customOptimizers, updatedAt: Date.now() }
    if (window.labo?.runtime === 'electron' && window.labo.saveDesktopState) {
      void window.labo.saveDesktopState('training', workspace)
    } else if (window.labo?.runtime === 'web' && webAuthenticated && window.labo.saveWebWorkspace) {
      void window.labo.saveWebWorkspace({ training: workspace })
    }
  }, [config, customOptimizers, storageReady, webAuthenticated])

  useEffect(() => {
    if (!optimizerMenu) return
    const dismiss = (event: PointerEvent) => { if (!(event.target as HTMLElement | null)?.closest('.optimizer-context-menu')) setOptimizerMenu(undefined) }
    const dismissOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOptimizerMenu(undefined) }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', dismissOnEscape)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', dismissOnEscape) }
  }, [optimizerMenu])

  const selectOptimizer = useCallback((kind: string) => {
    interactedRef.current = true
    setConfig(createOptimizerConfig(kind, {}, definitions))
  }, [definitions])
  const updateSetting = (key: string, value: OptimizerValue) => {
    interactedRef.current = true
    setConfig((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }
  const saveOptimizer = (optimizer: OptimizerDefinition) => {
    interactedRef.current = true
    const nextDefinitions = { ...definitions, [optimizer.id]: optimizer }
    setCustomOptimizers((current) => current.some((candidate) => candidate.id === optimizer.id)
      ? current.map((candidate) => candidate.id === optimizer.id ? optimizer : candidate)
      : [...current, optimizer])
    setConfig((current) => current.kind === optimizer.id
      ? createOptimizerConfig(optimizer.id, optimizer.defaults, nextDefinitions)
      : createOptimizerConfig(optimizer.id, {}, nextDefinitions))
    setCreatorOpen(false)
    setEditingOptimizer(undefined)
  }
  const openOptimizerEditor = (optimizerId: string) => {
    const optimizer = customOptimizers.find((candidate) => candidate.id === optimizerId)
    if (!optimizer) return
    setEditingOptimizer(optimizer)
    setCreatorOpen(true)
    setOptimizerMenu(undefined)
  }
  const deleteOptimizer = (optimizerId: string) => {
    interactedRef.current = true
    setCustomOptimizers((current) => current.filter((optimizer) => optimizer.id !== optimizerId))
    if (config.kind === optimizerId) setConfig(createOptimizerConfig('adamw'))
    setOptimizerMenu(undefined)
  }

  useEffect(() => onCatalogChange(customOptimizers), [customOptimizers, onCatalogChange])

  useEffect(() => {
    if (!requestedOptimizer || !storageReady || !definitions[requestedOptimizer.optimizerId]) return
    selectOptimizer(requestedOptimizer.optimizerId)
    onRequestedOptimizerHandled()
  }, [definitions, onRequestedOptimizerHandled, requestedOptimizer, selectOptimizer, storageReady])

  return <>
    <section className="workspace-toolbar">
      <div aria-label="Training editor view" className="view-switcher">
        <button aria-pressed={view === 'graph'} onClick={() => setView('graph')}><Blocks size={14} />Training graph</button>
        <button aria-pressed={view === 'pytorch'} onClick={() => setView('pytorch')}><Braces size={14} />PyTorch</button>
        <button aria-pressed={view === 'split'} onClick={() => setView('split')}><SplitSquareHorizontal size={14} />Split</button>
      </div>
      <div aria-label="Optimizer interaction mode" className="interaction-switcher">
        <button aria-pressed={interactionMode === 'use'} onClick={() => setInteractionMode('use')}><Blocks size={13} />Use optimizers</button>
        <button aria-pressed={interactionMode === 'edit'} onClick={() => setInteractionMode('edit')}><Pencil size={13} />Edit optimizers</button>
      </div>
      <div className="toolbar-meta"><span><span className="status-dot" /> Training IR synchronized</span></div>
    </section>

    <div className="workspace-grid training-workspace">
      <aside className="block-library">
        <div className="panel-heading"><Settings2 size={14} /><span>OPTIMIZERS</span></div>
        <section className="block-group optimizer-library">
          <h3>PyTorch 2.13</h3>
          {Object.values(optimizerRegistry).map((optimizer) => <button aria-label={`Use ${optimizer.label}`} className="library-block" disabled={interactionMode === 'edit'} key={optimizer.id} onClick={() => selectOptimizer(optimizer.id)}>
            <span className="block-glyph glyph-objective" />{optimizer.label}
          </button>)}
          <button aria-label="Create optimizer" className="library-block optimizer-create-button" onClick={() => { setEditingOptimizer(undefined); setCreatorOpen(true) }} type="button"><Plus size={13} />Create optimizer</button>
          {customOptimizers.length > 0 && <h3>Created</h3>}
          {customOptimizers.map((optimizer) => <button aria-label={interactionMode === 'edit' ? `Edit ${optimizer.label}` : `Use ${optimizer.label}`} className="library-block" key={optimizer.id} onClick={() => interactionMode === 'edit' ? openOptimizerEditor(optimizer.id) : selectOptimizer(optimizer.id)} onContextMenu={(event) => { event.preventDefault(); setOptimizerMenu({ optimizerId: optimizer.id, x: event.clientX, y: event.clientY }) }} title="Right-click to edit or delete">
            <span className="block-glyph glyph-objective" />{optimizer.label}
          </button>)}
        </section>
      </aside>

      <section className={`editor-grid view-${view === 'graph' ? 'blocks' : view}`}>
        {view !== 'pytorch' && <div className="canvas-panel">
          <div className="panel-tab"><Blocks size={13} /> training.optimizer</div>
          <div className="training-canvas">
            <article aria-label={`Optimizer card ${definition.label}`} className={`optimizer-block selected ${interactionMode === 'edit' ? 'editable' : ''}`} onContextMenu={(event) => { if (!config.kind.startsWith('custom-')) return; event.preventDefault(); setOptimizerMenu({ optimizerId: config.kind, x: event.clientX, y: event.clientY }) }} onDoubleClick={() => { if (interactionMode === 'edit') openOptimizerEditor(config.kind) }}>
              <header><span className="node-type">OPTIMIZER</span><strong>{definition.label}</strong><small>torch.optim.{definition.torchClass}</small></header>
              <div className="optimizer-inline-editor">
                {Object.entries(config.settings).map(([key, value]) => <label key={key}>
                  <span>{key}</span>
                  {typeof value === 'boolean'
                    ? <input aria-label={`${definition.label} ${key}`} checked={value} onChange={(event) => updateSetting(key, event.target.checked)} type="checkbox" />
                    : <input aria-label={`${definition.label} ${key}`} onChange={(event) => {
                        if (Array.isArray(value)) updateSetting(key, event.target.value.split(',').map((part) => part.trim() === 'None' ? null : Number(part)))
                        else if (value === null || typeof value === 'string') updateSetting(key, event.target.value === 'None' ? null : event.target.value)
                        else updateSetting(key, Number(event.target.value))
                      }} type={typeof value === 'number' ? 'number' : 'text'} value={formatValue(value)} />}
                </label>)}
              </div>
            </article>
          </div>
        </div>}
        {view !== 'graph' && <div className="code-panel">
          <div className="panel-tab"><Braces size={13} /> optimizer.py <span>GENERATED</span></div>
          <pre className="code-editor"><code>{code}</code></pre>
        </div>}
      </section>

      <aside className="inspector">
        <div className="panel-heading"><Cpu size={14} /><span>TRAINING INSPECTOR</span></div>
        <section className="inspector-section"><div className="section-title">Selection</div><div className="selection-card"><span className="selection-icon"><Play size={15} /></span><div><strong>{definition.label}</strong><small>{definition.notes ?? `torch.optim.${definition.torchClass}`}</small></div></div></section>
      </aside>
    </div>
    <footer className="statusbar"><span><span className="status-dot" /> Training IR valid</span><span>optimizer · {Object.keys(config.settings).length} settings</span><span className="status-spacer" /><span>PyTorch 2.13</span></footer>
    {creatorOpen && <OptimizerCreator definition={editingOptimizer} onCancel={() => { setCreatorOpen(false); setEditingOptimizer(undefined) }} onSave={saveOptimizer} />}
    {optimizerMenu && (() => {
      const optimizer = customOptimizers.find((candidate) => candidate.id === optimizerMenu.optimizerId)
      if (!optimizer) return null
      return <div className="card-context-menu optimizer-context-menu" role="menu" style={{ left: optimizerMenu.x, top: optimizerMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
        <button onClick={() => openOptimizerEditor(optimizer.id)} role="menuitem" type="button"><Pencil size={12} />Edit {optimizer.label}</button>
        <button onClick={() => deleteOptimizer(optimizer.id)} role="menuitem" type="button"><Trash2 size={12} />Delete {optimizer.label}</button>
      </div>
    })()}
    {settingsOpen && <StudioSettingsModal onClose={onCloseSettings} sections={[
      {
        id: 'studio', label: 'Studio', icon: <Settings2 size={13} />, content: <section className="training-settings-presets">
          <strong>Optimizer presets</strong>
          {customOptimizers.length === 0 ? <p>No custom optimizer yet.</p> : customOptimizers.map((optimizer) => <div key={`setting-${optimizer.id}`}>
            <button onClick={() => selectOptimizer(optimizer.id)} type="button"><span>{optimizer.label}</span><small>torch.optim.{optimizer.torchClass}</small></button>
            <button aria-label={`Delete optimizer preset ${optimizer.label}`} onClick={() => deleteOptimizer(optimizer.id)} title="Delete optimizer" type="button"><Trash2 size={12} /></button>
          </div>)}
        </section>,
      },
      { id: 'tips', label: 'Tips', icon: <Lightbulb size={13} />, content: <div className="studio-settings-tips"><p>Use <b>Use optimizers</b> to select a configuration.</p><p>Switch to <b>Edit optimizers</b>, then click, double-click or right-click a custom optimizer to edit or delete it.</p></div> },
    ]} />}
  </>
}
