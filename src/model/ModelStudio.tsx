import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Blocks,
  Braces,
  Code2,
  Cpu,

  PanelLeft,
  SplitSquareHorizontal,
  Pause,
  Play,
  Square,
  StepForward,
  Trash2,
  Zap,
} from 'lucide-react'
import '../App.css'
import { AtomicPlayer, type AtomicPlayerSnapshot } from '../core/atomic-player'
import { executionLayers } from '../core/execution-plan'
import { findOpenGraphPosition } from '../core/graph-placement'
import { addNode, compileToPyTorch, removeNode, updateNodeAttributes, validateGraph, type ArchitectureGraph, type TensorRole } from '../core/ir'
import { modelAtomRegistry, type ModelAtomDefinition } from '../core/model-atoms'
import { blankStarterPreset, complexityDeepPreset, gptLikeStarterPreset, tokenMoePreset, trBasicPreset } from '../core/presets'
import { researchBpePreset } from '../core/tokenizer-presets'
import { parsePyTorchDialect, type PyTorchDialectDiagnostic } from '../core/pytorch-dialect'
import { validCustomPyTorchModule } from '../core/pytorch-compiler'
import { deriveGraphStats } from '../core/stats'
import { GraphCanvas } from './GraphCanvas'
import { PythonCodeEditor } from './PythonCodeEditor'
import { AskLaboPanel } from './AskLaboPanel'
import { MODEL_CARD_HEIGHT, MODEL_CARD_WIDTH, resolveCardDrop } from './card-layout'

type ViewMode = 'blocks' | 'pytorch' | 'split'

interface CustomPyTorchCard {
  id: string
  label: string
  code: string
}

const CUSTOM_CARDS_STORAGE_KEY = 'labo.custom-pytorch-cards.v1'

function loadCustomCards(): CustomPyTorchCard[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_CARDS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((card): card is CustomPyTorchCard => typeof card?.id === 'string' && typeof card?.label === 'string' && typeof card?.code === 'string' && validCustomPyTorchModule(card.code))
  } catch {
    return []
  }
}

const graphInputDefinitions: Array<{ role: TensorRole; label: string }> = [
  { role: 'token-ids', label: 'Token IDs' },
  { role: 'hidden', label: 'Hidden State' },
  { role: 'labels', label: 'Training Labels' },
]



export function ModelStudio({ askOpen = false, onCloseAsk = () => undefined }: { askOpen?: boolean; onCloseAsk?: () => void }) {
  const [graph, setGraph] = useState(complexityDeepPreset)
  const [selectedNodeId, setSelectedNodeId] = useState('embedding')
  const [view, setView] = useState<ViewMode>('split')
  const [modelPlayerSnapshot, setModelPlayerSnapshot] = useState<AtomicPlayerSnapshot>({ status: 'idle', currentAtomId: complexityDeepPreset.nodes[0]?.id, results: complexityDeepPreset.nodes.map((node) => ({ atomId: node.id, status: 'pending' })) })
  const modelPlayerRef = useRef<AtomicPlayer | null>(null)
  const presetDraftsRef = useRef(new Map<string, { graph: ArchitectureGraph; selectedNodeId: string }>())
  const code = useMemo(() => compileToPyTorch(graph), [graph])
  const [codeDraft, setCodeDraft] = useState(code)
  const [parseDiagnostics, setParseDiagnostics] = useState<PyTorchDialectDiagnostic[]>([])
  const [sampleText, setSampleText] = useState('Bonjour LABO AI')
  const [promptTokenCount, setPromptTokenCount] = useState<number>()
  const [modelOutput, setModelOutput] = useState<LaboRuntimeTrace['modelOutput']>()
  const [customCards, setCustomCards] = useState<CustomPyTorchCard[]>(loadCustomCards)
  const [customCardName, setCustomCardName] = useState('My PyTorch block')
  const [customCardCode, setCustomCardCode] = useState('nn.Linear(768, 768)')
  const [customCardError, setCustomCardError] = useState('')
  const customCardSequenceRef = useRef(1)
  const stats = useMemo(() => deriveGraphStats(graph), [graph])
  const validation = useMemo(() => validateGraph(graph), [graph])
  const acceptsTokenIds = useMemo(() => graph.nodes.some((node) => node.role === 'token-ids' || graph.edges.some((edge) => edge.source === node.id && (edge.sourcePort === 'tokenIds' || edge.targetPort === 'tokenIds'))), [graph])
  const blankGraph = graph.nodes.length === 0
  const pytorchMappingComplete = validation.valid && code.includes('class GeneratedModel(nn.Module):')
  const pytorchDraftAvailable = code.includes('class GeneratedModel(nn.Module):')
  const runtimeAvailable = typeof window.labo?.runAtomic === 'function' && !blankGraph
  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId)
  const selectedGroup = graph.groups?.find((group) => group.id === selectedNodeId)


  useLayoutEffect(() => setCodeDraft(code), [code])

  useEffect(() => {
    window.localStorage.setItem(CUSTOM_CARDS_STORAGE_KEY, JSON.stringify(customCards))
  }, [customCards])

  useEffect(() => {
    let tracePromise: Promise<LaboRuntimeTrace> | undefined
    setModelOutput(undefined)
    setPromptTokenCount(undefined)
    const executionPlan = validation.valid ? executionLayers(graph) : graph.nodes.map((node) => [node.id])
    const player = new AtomicPlayer(executionPlan, async (atomId) => {
      if (!window.labo?.runAtomic) throw new Error('Atomic PyTorch execution requires the LABO AI desktop app')
      tracePromise ??= (acceptsTokenIds
        ? (async () => {
            const tokenTrace = await window.labo!.runAtomic({ kind: 'tokenizer', pipeline: researchBpePreset, sample: sampleText })
            if (tokenTrace.status === 'failed') throw new Error(tokenTrace.error ?? 'Tokenizer failed')
            if (!tokenTrace.tokenIds?.length) throw new Error('Tokenizer returned no Token IDs')
            setPromptTokenCount(tokenTrace.tokenIds.length)
            return window.labo!.runAtomic({ kind: 'model', graph, tokenIds: tokenTrace.tokenIds })
          })()
        : window.labo.runAtomic({ kind: 'model', graph })).then((trace) => {
          setModelOutput(trace.modelOutput)
          return trace
        })
      const trace = await tracePromise
      const result = trace.results.find((candidate) => candidate.atomId === atomId)
      if (!result) throw new Error(trace.error ?? `PyTorch stopped before ${atomId}`)
      if (result.status === 'failed') throw new Error(result.error ?? `PyTorch failed at ${atomId}`)
      return { summary: result.summary }
    }, { onRestart: () => { tracePromise = undefined; setModelOutput(undefined) } })
    modelPlayerRef.current = player
    return player.subscribe(setModelPlayerSnapshot)
  }, [acceptsTokenIds, graph, sampleText, validation.valid])

  const applyPyTorch = () => {
    const parsed = parsePyTorchDialect(codeDraft, graph)
    setParseDiagnostics(parsed.diagnostics)
    setGraph(parsed.graph)
  }

  const addModelAtom = (definition: ModelAtomDefinition, desiredPosition?: { x: number; y: number }, variant?: { label: string; attributes: Record<string, number | string | boolean> }) => {
    const sequence = graph.nodes.filter((node) => node.id.startsWith(`${definition.id}-`)).length + 1
    const outputTensor = definition.outputs[0]?.tensor
    const role: TensorRole = outputTensor === 'query' || outputTensor === 'key' || outputTensor === 'value'
      ? outputTensor
      : outputTensor === 'logits' || outputTensor === 'scalar' ? 'output' : 'hidden'
    const id = `${definition.id}-${sequence}`
    setGraph((current) => {
      const position = desiredPosition
        ? resolveCardDrop({
            id,
            original: desiredPosition,
            desired: desiredPosition,
            width: MODEL_CARD_WIDTH,
            height: MODEL_CARD_HEIGHT,
          }, current.nodes.map((node) => ({ id: node.id, position: node.position, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT })))
        : findOpenGraphPosition(current)
      return addNode(current, {
        id,
        kind: 'semantic',
        atomId: definition.id,
        label: variant?.label ?? definition.label,
        role,
        position,
        attributes: { ...Object.fromEntries(definition.settings.map((setting) => [setting.id, setting.default])), ...variant?.attributes },
      })
    })
    setSelectedNodeId(id)
  }

  const dropModelAtom = (atomId: string, position: { x: number; y: number }) => {
    const [definitionId, variantId] = atomId.split(':')
    const definition = modelAtomRegistry[definitionId]
    if (!definition) return
    if (definitionId === 'lm-head' && variantId === 'tied') {
      addModelAtom(definition, position, { label: 'Tied language-model head', attributes: { tieEmbeddingWeights: true, bias: false } })
      return
    }
    addModelAtom(definition, position)
  }

  const addGraphInput = (role: TensorRole, desiredPosition?: { x: number; y: number }) => {
    const definition = graphInputDefinitions.find((candidate) => candidate.role === role)
    if (!definition) return
    const baseId = role === 'token-ids' ? 'token-ids' : role === 'labels' ? 'labels' : 'hidden-state'
    let sequence = 1
    let id = baseId
    while (graph.nodes.some((node) => node.id === id)) id = `${baseId}-${++sequence}`
    setGraph((current) => {
      const position = desiredPosition
        ? resolveCardDrop({ id, original: desiredPosition, desired: desiredPosition, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT }, current.nodes.map((node) => ({ id: node.id, position: node.position, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT })))
        : findOpenGraphPosition(current)
      return addNode(current, { id, kind: 'input', label: definition.label, role, position })
    })
    setSelectedNodeId(id)
  }

  const addCustomCard = (card: CustomPyTorchCard, desiredPosition?: { x: number; y: number }) => {
    const id = `custom-${card.id}-${customCardSequenceRef.current++}`
    setGraph((current) => {
      const position = desiredPosition
        ? resolveCardDrop({ id, original: desiredPosition, desired: desiredPosition, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT }, current.nodes.map((node) => ({ id: node.id, position: node.position, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT })))
        : findOpenGraphPosition(current)
      return addNode(current, { id, kind: 'custom-pytorch', label: card.label, role: 'hidden', position, code: card.code })
    })
    setSelectedNodeId(id)
  }

  const createCustomCard = () => {
    const label = customCardName.trim()
    const code = customCardCode.trim()
    if (!label) {
      setCustomCardError('Give the card a name.')
      return
    }
    if (!validCustomPyTorchModule(code)) {
      setCustomCardError('Use one supported nn.Module constructor, for example nn.Linear(768, 768).')
      return
    }
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pytorch'
    let id = baseId
    let sequence = 2
    while (customCards.some((card) => card.id === id)) id = `${baseId}-${sequence++}`
    const card = { id, label, code }
    setCustomCards((current) => [...current, card])
    setCustomCardError('')
    addCustomCard(card)
  }

  const deleteSelectedNode = () => {
    if (!selectedNode) return
    const next = removeNode(graph, selectedNode.id)
    setGraph(next)
    setSelectedNodeId(next.nodes[0]?.id ?? '')
  }

  const updateQkvLayout = (key: 'queryHeads' | 'keyValueHeads' | 'headDim' | 'bias', value: number | boolean) => setGraph((current) => {
    if (typeof value === 'number' && (!Number.isInteger(value) || value <= 0)) return current
    const config = key === 'bias' ? current.config : { ...current.config, [key]: value }
    const queryHeads = key === 'queryHeads' ? Number(value) : config.queryHeads
    const keyValueHeads = key === 'keyValueHeads' ? Number(value) : config.keyValueHeads
    const headDim = key === 'headDim' ? Number(value) : config.headDim
    return { ...current, config, nodes: current.nodes.map((node) => {
      if (node.id === 'q-proj') return { ...node, attributes: { ...node.attributes, outFeatures: queryHeads * headDim, ...(key === 'bias' ? { bias: value } : {}) } }
      if (node.id === 'k-proj' || node.id === 'v-proj') return { ...node, attributes: { ...node.attributes, outFeatures: keyValueHeads * headDim, ...(key === 'bias' ? { bias: value } : {}) } }
      return node
    }) }
  })

  const loadPreset = (preset: ArchitectureGraph, selectedNodeId: string) => {
    presetDraftsRef.current.set(graph.id, { graph, selectedNodeId: selectedNode?.id ?? selectedGroup?.id ?? '' })
    const draft = presetDraftsRef.current.get(preset.id)
    setGraph(draft?.graph ?? preset)
    setSelectedNodeId(draft?.selectedNodeId ?? selectedNodeId)
    setParseDiagnostics([])
  }

  const modelAtoms = Object.values(modelAtomRegistry)
  const routingAtom = (definition: ModelAtomDefinition) => definition.category === 'routing' || definition.id === 'load-balancing-loss'
  const activationAtoms = modelAtoms.filter((definition) => definition.category === 'activation')
  const objectiveAtoms = modelAtoms.filter((definition) => definition.category === 'objective' && definition.id !== 'load-balancing-loss' && definition.id !== 'router-entropy-loss')
  const genericAtomIds = new Set(['token-embedding', 'qkv-projection', 'attention-head-layout', 'causal-sdpa', 'merge-attention-heads', 'attention-output-projection', 'residual-add', 'linear-projection', 'dropout', 'scale', 'hadamard-product', 'identity', 'lm-head'])
  const genericAtoms = modelAtoms.filter((definition) => genericAtomIds.has(definition.id))
  const specializedAtom = (definition: ModelAtomDefinition) => !genericAtomIds.has(definition.id) && definition.category !== 'routing' && definition.category !== 'objective' && definition.category !== 'activation' && !definition.composite
  const specializedFamilies = [
    { label: 'Embedding variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'embedding') },
    { label: 'Normalization variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'normalization') },
    { label: 'Attention variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'attention') },
    { label: 'Position variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'position') },
    { label: 'Composition variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'composition') },
    { label: 'MLP variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'mlp') },
    { label: 'Output variants', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'output') },
  ]
  const trBasicIds = new Set(['deterministic-token-routing', 'routed-expert-bank', 'shared-expert-bank', 'branch-gated-merge'])
  const learnedRouterIds = new Set(['moe-router', 'top-k-routing', 'load-balancing-loss', 'router-entropy-loss'])
  const trBasicAtoms = modelAtoms.filter((definition) => trBasicIds.has(definition.id))
  const learnedRouterAtoms = modelAtoms.filter((definition) => learnedRouterIds.has(definition.id))
  const routingRecipeAtoms = modelAtoms.filter((definition) => routingAtom(definition) && !trBasicIds.has(definition.id) && !learnedRouterIds.has(definition.id))
  const atomButton = (definition: ModelAtomDefinition) => <button
    aria-label={`Add ${definition.label}`}
    className="library-block"
    draggable
    key={definition.id}
    onDragEnd={(event) => event.currentTarget.blur()}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData('application/x-labo-model-atom', definition.id)
      event.dataTransfer.setData('text/plain', definition.label)
    }}
    onClick={() => addModelAtom(definition)}
    title="Click to add automatically, or drag onto the graph"
  >
    <span className={`block-glyph glyph-${definition.category}`} />
    {definition.label}
  </button>
  const tiedLmHeadButton = <button
    aria-label="Add Tied language-model head"
    className="library-block"
    draggable
    onClick={() => addModelAtom(modelAtomRegistry['lm-head'], undefined, { label: 'Tied language-model head', attributes: { tieEmbeddingWeights: true, bias: false } })}
    onDragEnd={(event) => event.currentTarget.blur()}
    onDragStart={(event) => {
      event.dataTransfer.effectAllowed = 'copy'
      event.dataTransfer.setData('application/x-labo-model-atom', 'lm-head:tied')
      event.dataTransfer.setData('text/plain', 'Tied language-model head')
    }}
    title="Click to add automatically, or drag onto the graph"
  >
    <span className="block-glyph glyph-output" />
    Tied language-model head
  </button>


  return (
    <>
      <section className="workspace-toolbar">
        <div className="toolbar-controls">
          <div className="view-switcher" aria-label="Editor view">
            <button aria-pressed={view === 'blocks'} onClick={() => setView('blocks')}><Blocks size={14} />Blocks</button>
            <button aria-pressed={view === 'pytorch'} onClick={() => setView('pytorch')}><Braces size={14} />PyTorch</button>
            <button aria-pressed={view === 'split'} onClick={() => setView('split')}><SplitSquareHorizontal size={14} />Split</button>
          </div>
          <div className="preset-switcher" aria-label="Model preset">
            <button aria-pressed={graph.id === blankStarterPreset.id} onClick={() => loadPreset(blankStarterPreset, '')}>Blank starter</button>
            <button aria-pressed={graph.id === gptLikeStarterPreset.id} onClick={() => loadPreset(gptLikeStarterPreset, 'embedding')}>GPT-like</button>
            <button aria-pressed={graph.id === trBasicPreset.id} onClick={() => loadPreset(trBasicPreset, 'fixed-router')}>TR Basic</button>
            <button aria-pressed={graph.id === tokenMoePreset.id} onClick={() => loadPreset(tokenMoePreset, 'embedding')}>Learned MoE</button>
            <button aria-pressed={graph.id === complexityDeepPreset.id} onClick={() => loadPreset(complexityDeepPreset, 'embedding')}>TR 300M</button>
          </div>
          <label className="model-prompt-control">
            <span>Generation prompt</span>
            <input aria-label="Model generation prompt" onChange={(event) => { setSampleText(event.target.value); setPromptTokenCount(undefined); setModelOutput(undefined) }} value={sampleText} />
            <small>{acceptsTokenIds ? (promptTokenCount === undefined ? 'Research BPE' : `${promptTokenCount} Token IDs`) : 'Add a Token IDs input'}</small>
          </label>
        </div>
        <div className="toolbar-meta">
          <span><span className={`status-dot ${pytorchDraftAvailable || blankGraph ? '' : 'invalid'}`} /> {blankGraph ? 'Blank canvas ready' : pytorchMappingComplete ? 'PyTorch graph executable' : pytorchDraftAvailable ? 'Atomic PyTorch draft' : 'PyTorch compile error'}</span>
          <span>{stats.nodeCount} atoms</span>
          <div className="atomic-player-controls" aria-label="Model atomic player">
            <button aria-label="Play model atoms" disabled={!runtimeAvailable} onClick={() => void modelPlayerRef.current?.play()} title={runtimeAvailable ? undefined : 'Open LABO AI in Electron to execute PyTorch'}><Play size={13} /></button>
            <button aria-label="Pause model atoms" disabled={!runtimeAvailable} onClick={() => modelPlayerRef.current?.pause()}><Pause size={13} /></button>
            <button aria-label="Step one model atom" disabled={!runtimeAvailable} onClick={() => void modelPlayerRef.current?.step()} title={runtimeAvailable ? undefined : 'Open LABO AI in Electron to execute PyTorch'}><StepForward size={13} /></button>
            <button aria-label="Stop model atoms" disabled={!runtimeAvailable} onClick={() => modelPlayerRef.current?.stop()}><Square size={12} /></button>
            <span className={`player-status status-${modelPlayerSnapshot.status}`}>{runtimeAvailable ? modelPlayerSnapshot.status : 'desktop only'}</span>
          </div>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="block-library">
          <div className="panel-heading"><PanelLeft size={14} /><span>BLOCK LIBRARY</span></div>
          <section className="block-group">
            <h3>Graph inputs</h3>
            {graphInputDefinitions.map((definition) => <button
              aria-label={`Add ${definition.label}`}
              className="library-block"
              draggable
              key={definition.role}
              onClick={() => addGraphInput(definition.role)}
              onDragEnd={(event) => event.currentTarget.blur()}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'copy'
                event.dataTransfer.setData('application/x-labo-graph-input', definition.role)
                event.dataTransfer.setData('text/plain', definition.label)
              }}
              title="Click to add automatically, or drag onto the graph"
            >
              <span className="block-glyph glyph-input" />
              {definition.label}
            </button>)}
            <details className="library-family custom-card-family" open>
              <summary>Create PyTorch card <span>{customCards.length}</span></summary>
              <div className="custom-card-builder">
                <label><span>Name</span><input aria-label="Custom card name" onChange={(event) => setCustomCardName(event.target.value)} value={customCardName} /></label>
                <label><span>PyTorch module</span><textarea aria-label="Custom card PyTorch code" onChange={(event) => setCustomCardCode(event.target.value)} rows={2} spellCheck={false} value={customCardCode} /></label>
                <small>Safe constructors: Linear, RMSNorm, LayerNorm, Dropout, Identity and common activations. Arbitrary Python is not evaluated.</small>
                {customCardError && <p role="alert">{customCardError}</p>}
                <button className="create-custom-card-button" onClick={createCustomCard}>Create and add card</button>
              </div>
              {customCards.length > 0 && <div className="custom-card-list">
                {customCards.map((card) => <button
                  aria-label={`Add ${card.label}`}
                  className="library-block custom-library-block"
                  draggable
                  key={card.id}
                  onClick={() => addCustomCard(card)}
                  onDragEnd={(event) => event.currentTarget.blur()}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy'
                    event.dataTransfer.setData('application/x-labo-custom-card', card.id)
                    event.dataTransfer.setData('text/plain', card.label)
                  }}
                  title={`${card.code} · Click or drag onto the graph`}
                >
                  <span className="block-glyph glyph-custom" />
                  <span><strong>{card.label}</strong><code>{card.code}</code></span>
                </button>)}
              </div>}
            </details>
            <h3>Generic atomics</h3>
            {genericAtoms.map(atomButton)}
            <details className="library-family" open>
              <summary>Specialized variants <span>{specializedFamilies.reduce((count, family) => count + family.atoms.length, 1)}</span></summary>
              <div className="library-subfamilies">
                {specializedFamilies.map((family) => <details className="library-subfamily" key={family.label}>
                  <summary>{family.label} <span>{family.atoms.length}</span></summary>
                  {family.atoms.map(atomButton)}
                </details>)}
                <details className="library-subfamily">
                  <summary>Tied output variant <span>1</span></summary>
                  {tiedLmHeadButton}
                </details>
              </div>
            </details>
            <details className="library-family" open>
              <summary>Training objectives <span>{objectiveAtoms.length}</span></summary>
              {objectiveAtoms.map(atomButton)}
            </details>
            <details className="library-family" open>
              <summary>Token-Routed MLP <span>{trBasicAtoms.length}</span></summary>
              {trBasicAtoms.map(atomButton)}
            </details>
            <details className="library-family" open>
              <summary>Learned Router Controls <span>{learnedRouterAtoms.length}</span></summary>
              {learnedRouterAtoms.map(atomButton)}
            </details>
            <details className="library-family">
              <summary>Routing Recipes <span>{routingRecipeAtoms.length}</span></summary>
              {routingRecipeAtoms.map(atomButton)}
            </details>
            <details className="library-family">
              <summary>Activations <span>{activationAtoms.length}</span></summary>
              {activationAtoms.map(atomButton)}
            </details>
          </section>
        </aside>

        <section className={`editor-grid view-${view}`}>
          {view !== 'pytorch' && <GraphCanvas graph={graph} onDropAtom={dropModelAtom} onDropCustom={(cardId, position) => {
            const card = customCards.find((candidate) => candidate.id === cardId)
            if (card) addCustomCard(card, position)
          }} onDropInput={(role, position) => addGraphInput(role, position)} playerSnapshot={modelPlayerSnapshot} selectedNodeId={selectedNodeId} setGraph={setGraph} setSelectedNodeId={setSelectedNodeId} />}

          {view !== 'blocks' && (
            <div className="code-panel">
              <div className="panel-tab"><Code2 size={13} /> generated_attention.py <span>LABO DIALECT</span><button aria-label="Apply PyTorch to blocks" onClick={applyPyTorch}>Apply to blocks</button></div>
              <PythonCodeEditor onChange={setCodeDraft} value={codeDraft} />
              {parseDiagnostics.length > 0 && <div className="code-diagnostics">{parseDiagnostics.map((diagnostic) => <p key={`${diagnostic.nodeId}-${diagnostic.code}`}>{diagnostic.message}</p>)}</div>}
            </div>
          )}
        </section>

        <aside className="inspector">
          <div className="panel-heading"><Cpu size={14} /><span>INSPECTOR</span></div>
          <section className="inspector-section">
            <div className="section-title">Selection</div>
            <div className="selection-card">
              <span className="selection-icon"><Zap size={15} /></span>
              <div><strong>{selectedNode?.label ?? selectedGroup?.label ?? 'No selection'}</strong><small>{selectedNode?.id ?? selectedGroup?.id ?? '—'}</small></div>
            </div>
          </section>
          <section className="inspector-section">
            <div className="section-title">Tensor contract</div>
            {selectedNode?.attributes && <div className="atomic-settings model-atomic-settings">
              {Object.entries(selectedNode.attributes).map(([key, value]) => <label key={key}>
                <span>{key}</span>
                {typeof value === 'boolean'
                  ? <input aria-label={`${selectedNode.label} ${key}`} checked={value} onChange={(event) => setGraph((current) => updateNodeAttributes(current, selectedNode.id, { [key]: event.target.checked }))} type="checkbox" />
                  : <input aria-label={`${selectedNode.label} ${key}`} onChange={(event) => setGraph((current) => updateNodeAttributes(current, selectedNode.id, { [key]: typeof value === 'number' ? Number(event.target.value) : event.target.value }))} type={typeof value === 'number' ? 'number' : 'text'} value={value} />}
              </label>)}
            </div>}
            {selectedNode?.kind === 'custom-pytorch' && <div className="atomic-settings custom-pytorch-settings">
              <label><span>Card name</span><input aria-label="Selected custom card name" onChange={(event) => setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, label: event.target.value } : node) }))} type="text" value={selectedNode.label} /></label>
              <label><span>PyTorch module</span><textarea aria-label="Selected custom card PyTorch code" onChange={(event) => setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, code: event.target.value } : node) }))} rows={4} spellCheck={false} value={selectedNode.code ?? ''} /></label>
              <small className={validCustomPyTorchModule(selectedNode.code ?? '') ? 'custom-code-valid' : 'custom-code-invalid'}>{validCustomPyTorchModule(selectedNode.code ?? '') ? 'Valid safe nn.Module constructor' : 'Invalid or unsupported nn.Module constructor'}</small>
            </div>}
            {selectedGroup && <div className="atomic-settings model-atomic-settings">
              <label><span>Q heads</span><input aria-label="Q heads" min="1" onChange={(event) => updateQkvLayout('queryHeads', Number(event.target.value))} type="number" value={graph.config.queryHeads} /></label>
              <label><span>KV heads</span><input aria-label="KV heads" min="1" onChange={(event) => updateQkvLayout('keyValueHeads', Number(event.target.value))} type="number" value={graph.config.keyValueHeads} /></label>
              <label><span>Head dim</span><input aria-label="Head dim" min="1" onChange={(event) => updateQkvLayout('headDim', Number(event.target.value))} type="number" value={graph.config.headDim} /></label>
              <label><span>Bias</span><input aria-label="QKV bias" checked={graph.nodes.find((node) => node.id === 'q-proj')?.attributes?.bias === true} onChange={(event) => updateQkvLayout('bias', event.target.checked)} type="checkbox" /></label>
            </div>}
            {selectedNode && <button aria-label="Delete selected model atom" className="delete-atom-button" onClick={deleteSelectedNode}><Trash2 size={13} />Delete atom</button>}
            {blankGraph && <p className="blank-graph-hint">Add an atomic block from the library or ask LABO to build a starter graph.</p>}
            {!blankGraph && !validation.valid && <p className="graph-incomplete-hint" title={validation.errors.join('\n')}>Graph incomplete · {validation.errors.length} wiring issue{validation.errors.length === 1 ? '' : 's'}. Connect the open ports before running.</p>}
          </section>
          <section className="equivalence-card">
            <div className="equivalence-title"><Play size={14} /> Atomic PyTorch execution</div>
            <div className="check-row"><span>Player</span><b>{modelPlayerSnapshot.status}</b></div>
            <div className="check-row"><span>Current level</span><b>{modelPlayerSnapshot.currentAtomIds?.join(' + ') ?? '—'}</b></div>
            {selectedNode && <div className="check-row"><span>Selected result</span><b>{modelPlayerSnapshot.results.find((result) => result.atomId === selectedNode.id)?.status ?? 'pending'}</b></div>}
            {modelPlayerSnapshot.error && <p className="execution-error">{modelPlayerSnapshot.error}</p>}
            <div aria-label="Model generation output" className="model-runtime-output">
              <div><span>Output</span><b>{modelOutput ? modelOutput.kind : blankGraph ? 'waiting for blocks' : 'pending'}</b></div>
              {modelOutput && <div><span>Tensor</span><b>[{modelOutput.tensorShape.join(', ')}]</b></div>}
              {modelOutput?.predictedTokenId !== undefined && <div><span>Predicted Token ID</span><b>{modelOutput.predictedTokenId}</b></div>}
              {modelOutput?.topTokenIds && <div><span>Top 5</span><code>{modelOutput.topTokenIds.map((tokenId, index) => `${tokenId} (${(((modelOutput.topProbabilities?.[index]) ?? 0) * 100).toFixed(2)}%)`).join(' · ')}</code></div>}
            </div>
          </section>
        </aside>
      </div>

      <AskLaboPanel graph={graph} onApply={setGraph} onClose={onCloseAsk} open={askOpen} />

      <footer className="statusbar">
        <span><span className={`status-dot ${validation.valid || blankGraph ? '' : 'invalid'}`} /> Neural IR {blankGraph ? 'blank' : validation.valid ? 'valid' : 'invalid'}</span>
        <span>{stats.nodeCount} nodes · {stats.edgeCount} links</span>
        <span className="status-spacer" />
        <span>PyTorch 2.7</span>
        <span>LABO Runtime · local</span>
      </footer>
    </>
  )
}
