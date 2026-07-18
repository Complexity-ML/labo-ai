import { useState } from 'react'
import { X } from 'lucide-react'
import type { TensorRole } from '../core/ir'
import { validCustomPyTorchModule } from '../core/pytorch-compiler'
import { composeCustomCard, customCardModule, customCardOperations, operationsByCategory, suggestedCardCategory, suggestedCardOperation, type CustomCardCategory, type CustomCardOperation, type CustomPyTorchCard } from './custom-card'

type CardDraft = Omit<CustomPyTorchCard, 'id'>
export type CustomCardDestination = 'library' | 'selected' | 'new-architecture'
export interface CustomCardCreateResult { ok: boolean; message?: string }

export function CustomCardCreator({ onClose, onCreate, selectedTarget }: { onClose(): void; onCreate(card: CardDraft, destination: CustomCardDestination): CustomCardCreateResult; selectedTarget?: string }) {
  const [name, setName] = useState('My PyTorch block')
  const [code, setCode] = useState('nn.Linear(768, 768)')
  const [operation, setOperation] = useState<CustomCardOperation>('linear')
  const [category, setCategory] = useState<CustomCardCategory>('projection')
  const [categoryManual, setCategoryManual] = useState(false)
  const [need, setNeed] = useState('Project a hidden tensor to the model dimension')
  const [inFeatures, setInFeatures] = useState(768)
  const [outFeatures, setOutFeatures] = useState(768)
  const [probability, setProbability] = useState(0.1)
  const [inputRole, setInputRole] = useState<TensorRole>('hidden')
  const [outputRole, setOutputRole] = useState<TensorRole>('hidden')
  const [error, setError] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)
  const [destination, setDestination] = useState<CustomCardDestination>('new-architecture')
  const availableOperations = customCardOperations.filter((candidate) => operationsByCategory[category].includes(candidate.id))

  const changeCategory = (nextCategory: CustomCardCategory) => {
    const nextOperation = suggestedCardOperation(nextCategory, need)
    setCategory(nextCategory)
    setCategoryManual(true)
    setOperation(nextOperation)
    setCode(customCardModule(nextOperation, inFeatures, outFeatures, probability))
    if (nextCategory !== 'projection') setOutputRole(inputRole)
    setError('')
  }

  const selectOperation = (next: CustomCardOperation) => {
    setOperation(next)
    setCode(customCardModule(next, inFeatures, outFeatures, probability))
  }

  const autoCompose = () => {
    const composedCategory = categoryManual ? category : suggestedCardCategory(need)
    const composed = composeCustomCard({ category: composedCategory, need, inFeatures, outFeatures, probability })
    setCategory(composedCategory)
    setOperation(composed.operation)
    setName(composed.label)
    setInputRole(composed.inputRole)
    setOutputRole(composed.outputRole)
    setCode(composed.code)
    setError('')
  }

  const composePrompt = async () => {
    if (!need.trim() || agentBusy) return
    if (!window.labo?.askLabo) return autoCompose()
    setAgentBusy(true)
    setError('')
    try {
      const plan = await window.labo.askLabo({
        request: `Compose exactly one reusable card for this need: ${need.trim()}`,
        context: {
          cardBuilderMode: true,
          responseLocale: navigator.language || 'en',
          graph: { nodes: [], connections: [] },
          availableAtomics: [],
          availableCustomCards: [],
          cardBuilder: { ...(categoryManual ? { preferredCategory: category } : {}), inFeatures, outFeatures, probability, inputRole, outputRole },
        },
      })
      const card = plan.createdBlocks[0]
      if (!card || !validCustomPyTorchModule(card.pytorchModule)) throw new Error('The agent did not return a valid reusable card.')
      const validRoles: TensorRole[] = ['token-ids', 'hidden', 'query', 'key', 'value', 'attention', 'output', 'logits', 'labels', 'scalar', 'routing-logits', 'expert-indices', 'routing-weights']
      const nextInputRole = validRoles.includes(card.inputRole as TensorRole) ? card.inputRole as TensorRole : inputRole
      const nextOutputRole = validRoles.includes(card.outputRole as TensorRole) ? card.outputRole as TensorRole : outputRole
      const matchedOperation = customCardOperations.find((candidate) => card.pytorchModule.startsWith(`nn.${candidate.label === 'Linear' ? 'Linear' : candidate.label}`))?.id
      if (matchedOperation) {
        setOperation(matchedOperation)
        const matchedCategory = (Object.entries(operationsByCategory) as Array<[CustomCardCategory, CustomCardOperation[]]>).find(([, operations]) => operations.includes(matchedOperation))?.[0]
        if (matchedCategory) setCategory(matchedCategory)
      }
      setName(card.label)
      setCode(card.pytorchModule)
      setInputRole(nextInputRole)
      setOutputRole(nextOutputRole)
    } catch (reason) {
      autoCompose()
      setError(`LABO agent unavailable; local composition used. ${reason instanceof Error ? reason.message : String(reason)}`)
    } finally {
      setAgentBusy(false)
    }
  }

  const create = () => {
    const label = name.trim()
    const module = code.trim()
    if (!label) return setError('Give the card a name.')
    if (!validCustomPyTorchModule(module)) return setError('Use one supported safe nn.Module constructor.')
    const result = onCreate({ label, code: module, ...(inputRole === 'hidden' ? {} : { inputRole }), ...(outputRole === 'hidden' ? {} : { outputRole }) }, destination)
    if (!result.ok) setError(result.message ?? 'The selected destination is not compatible with this card.')
  }

  return <div className="model-card-modal-backdrop">
    <section aria-label="Create model card" aria-modal="true" className="create-card-modal" role="dialog">
      <header><div><span>CARD BUILDER</span><strong>Compose a new atomic card</strong></div><button aria-label="Close card creator" onClick={onClose}><X size={14} /></button></header>
      <p className="create-card-hint">Describe the card. LABO composes it; open Advanced settings only when you need exact control.</p>
      <div className="card-prompt-composer">
        <label><span>What should this card do?</span><textarea aria-label="Custom card need" onChange={(event) => setNeed(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void composePrompt() } }} rows={2} value={need} /></label>
        <button disabled={agentBusy || !need.trim()} onClick={() => void composePrompt()} title="Compose · ⌘/Ctrl + Enter">{agentBusy ? 'Composing…' : 'Compose card'}</button>
      </div>
      <div className="card-constructor-flow" aria-label="Card construction blocks">
        <label className="constructor-block constructor-input"><span>INPUT PLUG</span><select aria-label="Custom card input type" onChange={(event) => { const role = event.target.value as TensorRole; setInputRole(role); if (category !== 'projection') setOutputRole(role) }} value={inputRole}><option value="hidden">Hidden H</option><option value="logits">Logits L</option><option value="attention">Attention A</option>{category === 'utility' && <option value="output">Generic O</option>}</select></label>
        <span className="constructor-link" aria-hidden="true">→</span>
        <div className="constructor-block constructor-operation"><span>PYTORCH ATOM</span><strong>{customCardOperations.find((candidate) => candidate.id === operation)?.label}</strong></div>
        <span className="constructor-link" aria-hidden="true">→</span>
        <label className="constructor-block constructor-output"><span>OUTPUT PLUG</span><select aria-label="Custom card output type" disabled={category !== 'projection'} onChange={(event) => setOutputRole(event.target.value as TensorRole)} value={outputRole}><option value="hidden">Hidden H</option><option value="logits">Logits L</option><option value="attention">Attention A</option><option value="output">Generic O</option></select></label>
      </div>
      <details className="card-builder-advanced">
        <summary><span>Advanced settings</span><small>{category} · {operation}</small></summary>
        <div className="card-builder-advanced-body">
          <label><span>Card category</span><select aria-label="Custom card category" onChange={(event) => changeCategory(event.target.value as CustomCardCategory)} value={category}><option value="projection">Projection</option><option value="normalization">Normalization</option><option value="activation">Activation</option><option value="regularization">Regularization</option><option value="utility">Utility / pass-through</option></select></label>
          <div className="card-constructor-palette" aria-label="Card operation palette">{availableOperations.map((candidate) => <button aria-pressed={operation === candidate.id} key={candidate.id} onClick={() => selectOperation(candidate.id)}>{candidate.label}</button>)}</div>
          <div className="card-constructor-settings">
            <label><span>Name</span><input aria-label="Custom card name" onChange={(event) => setName(event.target.value)} value={name} /></label>
            {operation === 'linear' && <><label><span>Input features</span><input aria-label="Custom card input features" min="1" onChange={(event) => { const value = Number(event.target.value); setInFeatures(value); setCode(customCardModule(operation, value, outFeatures, probability)) }} type="number" value={inFeatures} /></label><label><span>Output features</span><input aria-label="Custom card output features" min="1" onChange={(event) => { const value = Number(event.target.value); setOutFeatures(value); setCode(customCardModule(operation, inFeatures, value, probability)) }} type="number" value={outFeatures} /></label></>}
            {(operation === 'rmsnorm' || operation === 'layernorm') && <label><span>Normalized dimension</span><input aria-label="Custom card normalized dimension" min="1" onChange={(event) => { const value = Number(event.target.value); setOutFeatures(value); setCode(customCardModule(operation, inFeatures, value, probability)) }} type="number" value={outFeatures} /></label>}
            {operation === 'dropout' && <label><span>Probability</span><input aria-label="Custom card dropout probability" max="1" min="0" onChange={(event) => { const value = Number(event.target.value); setProbability(value); setCode(customCardModule(operation, inFeatures, outFeatures, value)) }} step="0.05" type="number" value={probability} /></label>}
          </div>
          <div className="card-constructor-code"><span>Generated PyTorch</span><textarea aria-label="Custom card PyTorch code" onChange={(event) => setCode(event.target.value)} rows={4} spellCheck={false} value={code} /><small className={validCustomPyTorchModule(code) ? 'custom-code-valid' : 'custom-code-invalid'}>{validCustomPyTorchModule(code) ? 'Valid safe nn.Module constructor' : 'Invalid or unsupported nn.Module constructor'}</small></div>
        </div>
      </details>
      <label className="card-destination-select"><span>Destination</span><select aria-label="Card destination" onChange={(event) => setDestination(event.target.value as CustomCardDestination)} value={destination}><option value="new-architecture">New architecture</option><option value="library">My cards only</option><option disabled={!selectedTarget} value="selected">After {selectedTarget ?? 'selected card'}</option></select><small>The reusable definition is always saved in My cards.</small></label>
      {error && <p className="model-card-modal-error" role="alert">{error}</p>}
      <footer><button onClick={onClose}>Cancel</button><button className="create-custom-card-button" onClick={create}>{destination === 'library' ? 'Save to My cards' : destination === 'selected' ? `Create after ${selectedTarget ?? 'selection'}` : 'Create as new architecture'}</button></footer>
    </section>
  </div>
}
