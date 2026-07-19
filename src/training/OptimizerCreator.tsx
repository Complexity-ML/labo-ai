import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { OptimizerDefinition, OptimizerValue } from '../core/optimizer-ir'

function validOptimizerValue(value: unknown): value is OptimizerValue {
  if (value === null || ['number', 'boolean', 'string'].includes(typeof value)) return true
  return Array.isArray(value) && value.every((item) => item === null || typeof item === 'number')
}

function parseDefaults(source: string): Record<string, OptimizerValue> {
  const parsed: unknown = JSON.parse(source)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Settings must be a JSON object.')
  const entries = Object.entries(parsed)
  if (entries.some(([, value]) => !validOptimizerValue(value))) throw new Error('Use numbers, booleans, strings, null, or arrays of numbers.')
  return Object.fromEntries(entries) as Record<string, OptimizerValue>
}

export function OptimizerCreator({ definition, onCancel, onSave }: { definition?: OptimizerDefinition; onCancel(): void; onSave(definition: OptimizerDefinition): void }) {
  const editing = Boolean(definition)
  const [label, setLabel] = useState(definition?.label ?? 'My optimizer')
  const [torchClass, setTorchClass] = useState(definition?.torchClass ?? 'AdamW')
  const [defaults, setDefaults] = useState(() => definition ? JSON.stringify(definition.defaults, null, 2) : '{\n  "lr": 0.001,\n  "weight_decay": 0.0\n}')
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const name = label.trim()
    const className = torchClass.trim()
    if (!name) {
      setError('Give the optimizer a name.')
      return
    }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(className)) {
      setError('Use a torch.optim class name such as AdamW or Muon.')
      return
    }
    try {
      const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'optimizer'
      onSave({
        id: definition?.id ?? `custom-${idBase}-${Date.now().toString(36)}`,
        label: name,
        torchClass: className,
        defaults: parseDefaults(defaults),
        notes: `Custom torch.optim.${className} optimizer.`,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return <div className="tokenizer-card-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
    <form aria-label={editing ? 'Edit optimizer' : 'Create optimizer'} aria-modal="true" className="tokenizer-card-modal optimizer-creator-modal" onPointerDown={(event) => event.stopPropagation()} onSubmit={submit} role="dialog">
      <header><div><span className="eyebrow">TRAINING STUDIO</span><h2>{editing ? 'Edit optimizer' : 'Create an optimizer'}</h2></div><button aria-label="Close optimizer editor" onClick={onCancel} type="button"><X size={18} /></button></header>
      <div className="tokenizer-card-form optimizer-creator-form">
        <label><span>Name</span><input aria-label="Optimizer name" autoFocus onChange={(event) => setLabel(event.target.value)} value={label} /></label>
        <label><span>torch.optim class</span><input aria-label="Optimizer PyTorch class" onChange={(event) => setTorchClass(event.target.value)} placeholder="AdamW" value={torchClass} /></label>
        <label><span>Default settings (JSON)</span><textarea aria-label="Optimizer default settings" onChange={(event) => setDefaults(event.target.value)} spellCheck={false} value={defaults} /></label>
        {error && <p className="optimizer-creator-error">{error}</p>}
      </div>
      <footer><button onClick={onCancel} type="button">Cancel</button><button type="submit">{editing ? 'Save optimizer' : 'Create optimizer'}</button></footer>
    </form>
  </div>
}
