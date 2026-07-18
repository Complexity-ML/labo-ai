import { useMemo, useState } from 'react'
import { Blocks, Braces, Cpu, Play, Settings2 } from 'lucide-react'
import { compileOptimizer, createOptimizerConfig, optimizerRegistry, type OptimizerConfig, type OptimizerValue } from '../core/optimizer-ir'

function formatValue(value: OptimizerValue): string {
  if (Array.isArray(value)) return value.map((item) => item === null ? 'None' : String(item)).join(', ')
  if (value === null) return 'None'
  return String(value)
}

export function TrainingStudio() {
  const [config, setConfig] = useState<OptimizerConfig>(() => createOptimizerConfig('adamw'))
  const definition = optimizerRegistry[config.kind]
  const code = useMemo(() => ['import torch', '', compileOptimizer(config), ''].join('\n'), [config])

  const selectOptimizer = (kind: string) => setConfig(createOptimizerConfig(kind))
  const updateSetting = (key: string, value: OptimizerValue) => setConfig((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))

  return <>
    <section className="workspace-toolbar">
      <div className="view-switcher"><button aria-pressed="true"><Blocks size={14} />Training graph</button><button aria-pressed="false"><Braces size={14} />PyTorch</button></div>
      <strong className="workspace-name">Optimizer pipeline</strong>
      <div className="toolbar-meta"><span><span className="status-dot" /> Training IR synchronized</span></div>
    </section>

    <div className="workspace-grid training-workspace">
      <aside className="block-library">
        <div className="panel-heading"><Settings2 size={14} /><span>OPTIMIZERS</span></div>
        <section className="block-group optimizer-library">
          <h3>PyTorch 2.13</h3>
          {Object.values(optimizerRegistry).map((optimizer) => <button aria-label={`Use ${optimizer.label}`} className="library-block" key={optimizer.id} onClick={() => selectOptimizer(optimizer.id)}>
            <span className="block-glyph glyph-objective" />{optimizer.label}
          </button>)}
        </section>
      </aside>

      <section className="editor-grid view-split">
        <div className="canvas-panel">
          <div className="panel-tab"><Blocks size={13} /> training.optimizer</div>
          <div className="training-canvas">
            <article className="optimizer-block selected">
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
        </div>
        <div className="code-panel">
          <div className="panel-tab"><Braces size={13} /> optimizer.py <span>GENERATED</span></div>
          <pre className="code-editor"><code>{code}</code></pre>
        </div>
      </section>

      <aside className="inspector">
        <div className="panel-heading"><Cpu size={14} /><span>TRAINING INSPECTOR</span></div>
        <section className="inspector-section"><div className="section-title">Selection</div><div className="selection-card"><span className="selection-icon"><Play size={15} /></span><div><strong>{definition.label}</strong><small>{definition.notes ?? `torch.optim.${definition.torchClass}`}</small></div></div></section>
      </aside>
    </div>
    <footer className="statusbar"><span><span className="status-dot" /> Training IR valid</span><span>optimizer · {Object.keys(config.settings).length} settings</span><span className="status-spacer" /><span>PyTorch 2.13</span></footer>
  </>
}
