import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Blocks,
  Braces,
  Code2,
  Cpu,

  PanelLeft,
  SplitSquareHorizontal,
  Pause,
  Pencil,
  Play,
  Square,
  StepForward,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import '../App.css'
import { AtomicPlayer, type AtomicPlayerSnapshot } from '../core/atomic-player'
import { executionLayers } from '../core/execution-plan'
import { architectureComponents } from '../core/graph-components'
import { findOpenGraphPosition, layoutArchitectureGraph, layoutParallelArchitecture } from '../core/graph-placement'
import { addNode, compileToPyTorch, removeNode, validateGraph, type ArchitectureGraph, type ArchitectureNode, type TensorRole } from '../core/ir'
import { connectCable } from '../core/cables'
import { cloneArchitectureGraph, emptyModelWorkspace, loadModelWorkspace, loadModelWorkspaceFromDatabase, parseModelWorkspace, saveModelWorkspace, saveModelWorkspaceCache, syncModelPresetDatabase, type ModelPresetDraft } from '../core/model-workspace'
import { modelAtomRegistry, type ModelAtomDefinition } from '../core/model-atoms'
import { blankStarterPreset, complexityDeepPreset, gptLikeStarterPreset, tokenMoePreset, trBasicPreset } from '../core/presets'
import { multimodalImageEditorPreset, videoTransformerPreset, visionTransformerPreset } from '../core/media-presets'
import { researchBpePreset } from '../core/tokenizer-presets'
import { parsePyTorchDialect, type PyTorchDialectDiagnostic } from '../core/pytorch-dialect'
import { validCustomPyTorchModule } from '../core/pytorch-compiler'
import { deriveGraphStats } from '../core/stats'
import { GraphCanvas } from './GraphCanvas'
import { PythonCodeEditor } from './PythonCodeEditor'
import { AskLaboPanel } from './AskLaboPanel'
import type { AgentGraphAction } from '../core/agentic-graph'
import { MODEL_CARD_HEIGHT, MODEL_CARD_WIDTH, resolveCardDrop } from './card-layout'
import { CustomCardCreator, type CustomCardDestination, type CustomCardCreateResult } from './CustomCardCreator'
import type { CustomPyTorchCard } from './custom-card'
import { ExportMenu } from './ExportMenu'
import { exportArchitectureDiagram, exportPyTorchCode } from './export-actions'

type ViewMode = 'blocks' | 'pytorch' | 'split'
type InteractionMode = 'add' | 'edit'

interface CardEditDraft {
  label: string
  attributes?: Record<string, number | string | boolean>
  code?: string
}

const CUSTOM_CARDS_STORAGE_KEY = 'labo.custom-pytorch-cards.v1'

function isCustomCard(value: unknown): value is CustomPyTorchCard {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<CustomPyTorchCard>
  return typeof card.id === 'string' && typeof card.label === 'string' && typeof card.code === 'string' && validCustomPyTorchModule(card.code)
}

const builtInModelPresets = [blankStarterPreset, gptLikeStarterPreset, trBasicPreset, tokenMoePreset, complexityDeepPreset, visionTransformerPreset, multimodalImageEditorPreset, videoTransformerPreset]
const presetMenuLabels: Record<string, string> = {
  [blankStarterPreset.id]: 'Blank starter',
  [gptLikeStarterPreset.id]: 'GPT-like',
  [trBasicPreset.id]: 'TR Basic',
  [tokenMoePreset.id]: 'Learned MoE',
  [complexityDeepPreset.id]: 'TR 300M',
  [visionTransformerPreset.id]: 'Vision',
  [multimodalImageEditorPreset.id]: 'Image edit',
  [videoTransformerPreset.id]: 'Video',
}

function loadCustomCards(): CustomPyTorchCard[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_CARDS_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCustomCard)
  } catch {
    return []
  }
}

const graphInputDefinitions: Array<{ role: TensorRole; label: string }> = [
  { role: 'token-ids', label: 'Token IDs' },
  { role: 'hidden', label: 'Hidden State' },
  { role: 'labels', label: 'Training Labels' },
]



export function ModelStudio({ askOpen = false, onCloseAsk = () => undefined, requestedCard, onRequestedCardHandled = () => undefined }: { askOpen?: boolean; onCloseAsk?: () => void; requestedCard?: { atomId: string; requestId: number }; onRequestedCardHandled?: () => void }) {
  const webRuntime = window.labo?.runtime === 'web'
  const [initialWorkspace] = useState(() => webRuntime ? emptyModelWorkspace() : loadModelWorkspace())
  const initialPreset = initialWorkspace.userPresets.find((preset) => preset.id === initialWorkspace.activePresetId)
    ?? builtInModelPresets.find((preset) => preset.id === initialWorkspace.activePresetId)
    ?? complexityDeepPreset
  const initialDraft = initialWorkspace.drafts[initialPreset.id]
  const initialGraph = initialDraft?.graph ?? initialPreset
  const [graph, setGraph] = useState(() => cloneArchitectureGraph(initialGraph))
  const [selectedNodeId, setSelectedNodeId] = useState(initialDraft?.selectedNodeId ?? initialGraph.nodes[0]?.id ?? '')
  const [view, setView] = useState<ViewMode>('split')
  const [selectedArchitectureId, setSelectedArchitectureId] = useState('')
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('add')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [modelPlayerSnapshot, setModelPlayerSnapshot] = useState<AtomicPlayerSnapshot>({ status: 'idle', currentAtomId: initialGraph.nodes[0]?.id, results: initialGraph.nodes.map((node) => ({ atomId: node.id, status: 'pending' })) })
  const modelPlayerRef = useRef<AtomicPlayer | null>(null)
  const pendingAgentRunRef = useRef<'play' | 'step' | undefined>(undefined)
  const presetDraftsRef = useRef(new Map<string, ModelPresetDraft>(Object.entries(initialWorkspace.drafts)))
  const [userPresets, setUserPresets] = useState(() => initialWorkspace.userPresets.map(cloneArchitectureGraph))
  const [presetName, setPresetName] = useState('My model')
  const [presetError, setPresetError] = useState('')
  const [confirmPresetReset, setConfirmPresetReset] = useState(false)
  const [databaseReady, setDatabaseReady] = useState(false)
  const [webAuthenticated, setWebAuthenticated] = useState(false)
  const webSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const webPendingSaveRef = useRef<{ workspace: unknown; customCards: CustomPyTorchCard[] } | undefined>(undefined)
  const webAuthenticatedRef = useRef(false)
  const startupGraphRef = useRef(graph)
  const startupSelectionRef = useRef(selectedNodeId)
  const startupUserPresetsRef = useRef(userPresets)
  const latestGraphRef = useRef(graph)
  const latestSelectionRef = useRef(selectedNodeId)
  const latestUserPresetsRef = useRef(userPresets)
  latestGraphRef.current = graph
  latestSelectionRef.current = selectedNodeId
  latestUserPresetsRef.current = userPresets
  webAuthenticatedRef.current = webAuthenticated
  const graphArchitectures = useMemo(() => architectureComponents(graph, [...builtInModelPresets, ...userPresets]), [graph, userPresets])
  const selectedArchitecture = graphArchitectures.find((component) => component.id === selectedArchitectureId) ?? graphArchitectures[0]
  const codeGraph = selectedArchitecture?.graph ?? graph
  const code = useMemo(() => compileToPyTorch(codeGraph), [codeGraph])
  const [codeDraft, setCodeDraft] = useState(code)
  const [parseDiagnostics, setParseDiagnostics] = useState<PyTorchDialectDiagnostic[]>([])
  const [sampleText, setSampleText] = useState('Hello LABO AI')
  const [promptTokenCount, setPromptTokenCount] = useState<number>()
  const [modelOutput, setModelOutput] = useState<LaboRuntimeTrace['modelOutput']>()
  const [customCards, setCustomCards] = useState<CustomPyTorchCard[]>(() => webRuntime ? [] : loadCustomCards())
  const [createCardOpen, setCreateCardOpen] = useState(false)
  const [editingNodeId, setEditingNodeId] = useState<string>()
  const [cardEditDraft, setCardEditDraft] = useState<CardEditDraft>()
  const [cardEditError, setCardEditError] = useState('')
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
  const editingNode = editingNodeId ? graph.nodes.find((node) => node.id === editingNodeId) : undefined


  useLayoutEffect(() => setCodeDraft(code), [code])

  useEffect(() => {
    if (selectedArchitecture && selectedArchitecture.id !== selectedArchitectureId) setSelectedArchitectureId(selectedArchitecture.id)
  }, [selectedArchitecture, selectedArchitectureId])

  useEffect(() => {
    const containingArchitecture = graphArchitectures.find((architecture) => architecture.nodeIds.includes(selectedNodeId))
    if (containingArchitecture && containingArchitecture.id !== selectedArchitectureId) setSelectedArchitectureId(containingArchitecture.id)
  }, [graphArchitectures, selectedArchitectureId, selectedNodeId])

  useEffect(() => setConfirmPresetReset(false), [graph.id])

  useEffect(() => {
    if (!webRuntime) window.localStorage.setItem(CUSTOM_CARDS_STORAGE_KEY, JSON.stringify(customCards))
  }, [customCards, webRuntime])

  useEffect(() => {
    let cancelled = false
    if (webRuntime) {
      const load = window.labo?.loadWebWorkspace
      if (!load) {
        setDatabaseReady(true)
        return
      }
      void load().then((result) => {
        if (cancelled) return
        webAuthenticatedRef.current = result.authenticated
        setWebAuthenticated(result.authenticated)
        const serverWorkspace = parseModelWorkspace(result.workspace)
        const untouchedSinceStartup = latestGraphRef.current === startupGraphRef.current
          && latestSelectionRef.current === startupSelectionRef.current
          && latestUserPresetsRef.current === startupUserPresetsRef.current
        if (result.authenticated && serverWorkspace.updatedAt > 0) {
          if (untouchedSinceStartup) {
            const storedPreset = serverWorkspace.userPresets.find((preset) => preset.id === serverWorkspace.activePresetId)
              ?? builtInModelPresets.find((preset) => preset.id === serverWorkspace.activePresetId)
              ?? complexityDeepPreset
            const storedDraft = serverWorkspace.drafts[storedPreset.id]
            const storedGraph = cloneArchitectureGraph(storedDraft?.graph ?? storedPreset)
            presetDraftsRef.current = new Map(Object.entries(serverWorkspace.drafts))
            setUserPresets(serverWorkspace.userPresets.map(cloneArchitectureGraph))
            setGraph(storedGraph)
            setSelectedNodeId(storedDraft?.selectedNodeId ?? storedGraph.nodes[0]?.id ?? '')
          } else {
            presetDraftsRef.current = new Map([...Object.entries(serverWorkspace.drafts), ...presetDraftsRef.current])
            setUserPresets((current) => {
              const merged = new Map(serverWorkspace.userPresets.map((preset) => [preset.id, cloneArchitectureGraph(preset)]))
              for (const preset of current) merged.set(preset.id, preset)
              return [...merged.values()]
            })
          }
        }
        if (result.authenticated && Array.isArray(result.customCards)) {
          const storedCards = result.customCards.filter(isCustomCard)
          setCustomCards((current) => {
            if (untouchedSinceStartup) return storedCards
            const merged = new Map(storedCards.map((card) => [card.id, card]))
            for (const card of current) merged.set(card.id, card)
            return [...merged.values()]
          })
        }
        setDatabaseReady(true)
      }).catch(() => {
        if (!cancelled) setDatabaseReady(true)
      })
      return () => { cancelled = true }
    }
    void loadModelWorkspaceFromDatabase().then((databaseWorkspace) => {
      if (cancelled) return
      const untouchedSinceStartup = latestGraphRef.current === startupGraphRef.current
        && latestSelectionRef.current === startupSelectionRef.current
        && latestUserPresetsRef.current === startupUserPresetsRef.current
      if (initialWorkspace.updatedAt === 0 && databaseWorkspace && untouchedSinceStartup) {
        const storedPreset = databaseWorkspace.userPresets.find((preset) => preset.id === databaseWorkspace.activePresetId)
          ?? builtInModelPresets.find((preset) => preset.id === databaseWorkspace.activePresetId)
          ?? complexityDeepPreset
        const storedDraft = databaseWorkspace.drafts[storedPreset.id]
        const storedGraph = cloneArchitectureGraph(storedDraft?.graph ?? storedPreset)
        presetDraftsRef.current = new Map(Object.entries(databaseWorkspace.drafts))
        setUserPresets(databaseWorkspace.userPresets.map(cloneArchitectureGraph))
        setGraph(storedGraph)
        setSelectedNodeId(storedDraft?.selectedNodeId ?? storedGraph.nodes[0]?.id ?? '')
      }
      setDatabaseReady(true)
    })
    return () => { cancelled = true }
  }, [initialWorkspace, webRuntime])

  useEffect(() => {
    const selected = graph.nodes.some((node) => node.id === selectedNodeId) || graph.groups?.some((group) => group.id === selectedNodeId)
      ? selectedNodeId
      : ''
    presetDraftsRef.current.set(graph.id, { graph, selectedNodeId: selected })
    const workspace = {
      activePresetId: graph.id,
      drafts: Object.fromEntries(presetDraftsRef.current),
      userPresets,
      updatedAt: Date.now(),
    }
    if (databaseReady) {
      if (webRuntime) {
        if (webAuthenticated && window.labo?.saveWebWorkspace) {
          const payload = { workspace, customCards }
          webPendingSaveRef.current = payload
          if (webSaveTimerRef.current) clearTimeout(webSaveTimerRef.current)
          webSaveTimerRef.current = setTimeout(() => {
            void window.labo?.saveWebWorkspace?.(payload).then(() => {
              if (webPendingSaveRef.current === payload) webPendingSaveRef.current = undefined
            })
          }, 700)
        }
      } else saveModelWorkspace(workspace)
    } else if (!webRuntime && (graph !== startupGraphRef.current || selectedNodeId !== startupSelectionRef.current || userPresets !== startupUserPresetsRef.current)) {
      saveModelWorkspaceCache(workspace)
    }
    return () => {
      if (webSaveTimerRef.current) clearTimeout(webSaveTimerRef.current)
    }
  }, [customCards, databaseReady, graph, selectedNodeId, userPresets, webAuthenticated, webRuntime])

  useEffect(() => () => {
    if (webSaveTimerRef.current) clearTimeout(webSaveTimerRef.current)
    const pending = webPendingSaveRef.current
    if (webRuntime && webAuthenticatedRef.current && pending && window.labo?.saveWebWorkspace) void window.labo.saveWebWorkspace(pending)
  }, [webRuntime])

  useEffect(() => {
    if (databaseReady && !webRuntime) syncModelPresetDatabase(builtInModelPresets, userPresets)
  }, [databaseReady, userPresets, webRuntime])

  useEffect(() => {
    let tracePromise: Promise<LaboRuntimeTrace> | undefined
    setModelOutput(undefined)
    setPromptTokenCount(undefined)
    const executionPlan = validation.valid ? executionLayers(graph) : graph.nodes.map((node) => [node.id])
    const player = new AtomicPlayer(executionPlan, async (atomId) => {
      const runAtomic = window.labo?.runAtomic
      if (!runAtomic) throw new Error('Atomic PyTorch execution requires the LABO AI desktop app')
      const runArchitectures = async (tokenIds?: number[]) => {
        const traces = await Promise.all(graphArchitectures.map((architecture) => runAtomic({ kind: 'model', graph: architecture.graph, ...(tokenIds ? { tokenIds } : {}) })))
        const failed = traces.find((trace) => trace.status === 'failed')
        return {
          engine: 'pytorch' as const,
          status: failed ? 'failed' as const : 'completed' as const,
          ...(failed?.currentAtomId ? { currentAtomId: failed.currentAtomId } : {}),
          ...(failed?.error ? { error: failed.error } : {}),
          modelOutput: traces.findLast((trace) => trace.modelOutput)?.modelOutput,
          results: traces.flatMap((trace) => trace.results),
        }
      }
      tracePromise ??= (acceptsTokenIds
        ? (async () => {
            const tokenTrace = await runAtomic({ kind: 'tokenizer', pipeline: researchBpePreset, sample: sampleText })
            if (tokenTrace.status === 'failed') throw new Error(tokenTrace.error ?? 'Tokenizer failed')
            if (!tokenTrace.tokenIds?.length) throw new Error('Tokenizer returned no Token IDs')
            setPromptTokenCount(tokenTrace.tokenIds.length)
            return runArchitectures(tokenTrace.tokenIds)
          })()
        : runArchitectures()).then((trace) => {
          setModelOutput(trace.modelOutput)
          return trace
        })
      const trace = await tracePromise
      const result = trace.results.find((candidate) => candidate.atomId === atomId)
      if (!result) throw new Error(trace.error ?? `PyTorch stopped before ${atomId}`)
      if (result.status === 'failed') throw new Error(result.error ?? `PyTorch failed at ${atomId}`)
      return { summary: result.summary }
    }, { onRestart: () => { tracePromise = undefined; setModelOutput(undefined) }, continueAfterFailure: true })
    modelPlayerRef.current = player
    return player.subscribe(setModelPlayerSnapshot)
  }, [acceptsTokenIds, graph, graphArchitectures, sampleText, validation.valid])

  useEffect(() => {
    const mode = pendingAgentRunRef.current
    if (!mode) return
    pendingAgentRunRef.current = undefined
    if (mode === 'play') void modelPlayerRef.current?.play()
    else void modelPlayerRef.current?.step()
  }, [graph])

  const applyPyTorch = () => {
    const parsed = parsePyTorchDialect(codeDraft, codeGraph)
    setParseDiagnostics(parsed.diagnostics)
    const selectedIds = new Set(codeGraph.nodes.map((node) => node.id))
    setGraph((current) => ({
      ...current,
      config: parsed.graph.config,
      contracts: parsed.graph.contracts,
      nodes: [...current.nodes.filter((node) => !selectedIds.has(node.id)), ...parsed.graph.nodes],
      edges: [...current.edges.filter((edge) => !selectedIds.has(edge.source) && !selectedIds.has(edge.target)), ...parsed.graph.edges],
    }))
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
      return addNode(current, { id, kind: 'custom-pytorch', label: card.label, role: card.outputRole ?? 'hidden', position, code: card.code, attributes: { inputRole: card.inputRole ?? 'hidden' } })
    })
    setSelectedNodeId(id)
  }

  const createCustomCard = ({ label, code, inputRole, outputRole }: Omit<CustomPyTorchCard, 'id'>, destination: CustomCardDestination): CustomCardCreateResult => {
    const baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pytorch'
    let id = baseId
    let sequence = 2
    while (customCards.some((card) => card.id === id)) id = `${baseId}-${sequence++}`
    const card: CustomPyTorchCard = { id, label, code, ...(inputRole ? { inputRole } : {}), ...(outputRole ? { outputRole } : {}) }
    const inputTensor = inputRole ?? 'hidden'
    const outputTensor = outputRole ?? 'hidden'
    const current = latestGraphRef.current
    const graphNodeId = (() => {
      const base = `custom-${card.id}`
      let candidate = base
      let suffix = 2
      while (current.nodes.some((node) => node.id === candidate)) candidate = `${base}-${suffix++}`
      return candidate
    })()
    const customNode: ArchitectureNode = { id: graphNodeId, kind: 'custom-pytorch', label: card.label, role: outputTensor, position: findOpenGraphPosition(current), code: card.code, attributes: { inputRole: inputTensor } }

    if (destination === 'selected') {
      const source = current.nodes.find((node) => node.id === selectedNodeId)
      const definition = source?.atomId ? modelAtomRegistry[source.atomId] : undefined
      const output = source?.kind === 'input'
        ? { id: source.role === 'token-ids' ? 'tokenIds' : source.role, tensor: source.role }
        : source?.kind === 'custom-pytorch'
          ? { id: 'output', tensor: source.role }
          : definition?.outputs.find((port) => port.tensor === inputTensor)
      if (!source || !output || output.tensor !== inputTensor) return { ok: false, message: `${source?.label ?? 'The selected card'} has no ${inputTensor} output for this card.` }
      const withNode = addNode(current, customNode)
      const connected = connectCable(withNode, { sourceId: source.id, sourcePort: inputTensor, sourcePortId: output.id, targetId: graphNodeId, targetPort: inputTensor, targetPortId: 'input' })
      if (!connected.ok) return { ok: false, message: connected.message }
      setGraph(layoutArchitectureGraph(connected.graph, [graphNodeId]))
      setSelectedNodeId(graphNodeId)
    } else if (destination === 'new-architecture') {
      let inputId = `${graphNodeId}-input`
      let suffix = 2
      while (current.nodes.some((node) => node.id === inputId)) inputId = `${graphNodeId}-input-${suffix++}`
      const metadata = {
        laboArchitectureName: `Custom · ${label}`,
        laboArchitectureHiddenSize: current.config.hiddenSize,
        laboArchitectureQueryHeads: current.config.queryHeads,
        laboArchitectureKeyValueHeads: current.config.keyValueHeads,
        laboArchitectureHeadDim: current.config.headDim,
      }
      const inputNode: ArchitectureNode = { id: inputId, kind: 'input', label: `${label} input`, role: inputTensor, position: findOpenGraphPosition(current), attributes: metadata }
      const withNodes = addNode(addNode(current, inputNode), { ...customNode, attributes: { ...customNode.attributes, ...metadata } })
      const connected = connectCable(withNodes, { sourceId: inputId, sourcePort: inputTensor, sourcePortId: inputTensor === 'token-ids' ? 'tokenIds' : inputTensor, targetId: graphNodeId, targetPort: inputTensor, targetPortId: 'input' })
      if (!connected.ok) return { ok: false, message: connected.message }
      setGraph(layoutParallelArchitecture(connected.graph, [inputId, graphNodeId]))
      setSelectedNodeId(graphNodeId)
    }
    setCustomCards((current) => [...current, card])
    setCreateCardOpen(false)
    return { ok: true }
  }

  const openCardCreator = () => {
    setInteractionMode('add')
    setCreateCardOpen(true)
  }

  const openCardEditor = (nodeId: string) => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    setSelectedNodeId(node.id)
    setEditingNodeId(node.id)
    setCardEditDraft({ label: node.label, attributes: node.attributes ? { ...node.attributes } : undefined, code: node.code })
    setCardEditError('')
  }

  const closeCardEditor = () => {
    setEditingNodeId(undefined)
    setCardEditDraft(undefined)
    setCardEditError('')
  }

  const saveCardEditor = () => {
    if (!editingNode || !cardEditDraft) return
    const label = cardEditDraft.label.trim()
    if (!label) return setCardEditError('Give the card a name.')
    if (editingNode.kind === 'custom-pytorch' && !validCustomPyTorchModule(cardEditDraft.code ?? '')) {
      return setCardEditError('Use one safe nn.Module constructor with literal arguments only.')
    }
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === editingNode.id ? {
        ...node,
        label,
        attributes: cardEditDraft.attributes,
        code: cardEditDraft.code?.trim(),
      } : node),
    }))
    closeCardEditor()
  }

  const deleteEditingCard = () => {
    if (!editingNode) return
    const next = removeNode(graph, editingNode.id)
    setGraph(next)
    setSelectedNodeId(next.nodes[0]?.id ?? '')
    closeCardEditor()
    setInteractionMode('edit')
  }

  const deleteGraphCard = (nodeId: string) => {
    const next = removeNode(graph, nodeId)
    setGraph(next)
    setSelectedNodeId(next.nodes[0]?.id ?? '')
    if (editingNodeId === nodeId) closeCardEditor()
  }

  const deleteGraphCards = (nodeIds: string[]) => {
    const removed = new Set(nodeIds)
    let next = graph
    for (const nodeId of removed) next = removeNode(next, nodeId)
    setGraph(next)
    setSelectedNodeId(next.nodes[0]?.id ?? '')
    if (editingNodeId && removed.has(editingNodeId)) closeCardEditor()
  }

  const deleteCustomCardDefinition = (cardId: string) => setCustomCards((current) => current.filter((card) => card.id !== cardId))

  useEffect(() => {
    if (!requestedCard) return
    setInteractionMode('add')
    if (requestedCard.atomId === 'token-ids-input') addGraphInput('token-ids')
    else if (requestedCard.atomId === 'hidden-state-input') addGraphInput('hidden')
    else if (requestedCard.atomId === 'training-labels-input') addGraphInput('labels')
    else {
      const definition = modelAtomRegistry[requestedCard.atomId]
      if (definition && !definition.composite) addModelAtom(definition)
    }
    onRequestedCardHandled()
  // The request id is the deliberate one-shot trigger; graph changes must not replay it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedCard?.requestId])

  const loadPreset = (preset: ArchitectureGraph, selectedNodeId: string) => {
    presetDraftsRef.current.set(graph.id, { graph, selectedNodeId: selectedNode?.id ?? selectedGroup?.id ?? '' })
    const draft = presetDraftsRef.current.get(preset.id)
    setGraph(cloneArchitectureGraph(draft?.graph ?? preset))
    setSelectedNodeId(draft?.selectedNodeId ?? selectedNodeId)
    setParseDiagnostics([])
  }

  const saveGraphAsPreset = (requestedName: string, sourceGraph: ArchitectureGraph = graph) => {
    const name = requestedName.trim()
    if (!name) {
      setPresetError('Give the preset a name.')
      return
    }
    const baseId = `user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'}`
    const usedIds = new Set([...builtInModelPresets, ...userPresets].map((preset) => preset.id))
    let id = baseId
    let sequence = 2
    while (usedIds.has(id)) id = `${baseId}-${sequence++}`
    const preset = cloneArchitectureGraph({ ...sourceGraph, id, name })
    presetDraftsRef.current.set(id, { graph: preset, selectedNodeId })
    setUserPresets((current) => [...current, preset])
    setGraph(preset)
    setPresetError('')
    return preset
  }


  const createUserPreset = () => { saveGraphAsPreset(presetName) }

  const createBlankWorkspace = () => {
    let sequence = 1
    const usedIds = new Set([...builtInModelPresets, ...userPresets].map((preset) => preset.id))
    while (usedIds.has(`user-blank-${sequence}`)) sequence += 1
    const blank = cloneArchitectureGraph({ ...blankStarterPreset, id: `user-blank-${sequence}`, name: `Blank canvas ${sequence}` })
    presetDraftsRef.current.set(blank.id, { graph: blank, selectedNodeId: '' })
    setUserPresets((current) => [...current, blank])
    setGraph(blank)
    setSelectedNodeId('')
    setInteractionMode('add')
  }

  const resetCurrentPreset = () => {
    const original = builtInModelPresets.find((preset) => preset.id === graph.id) ?? userPresets.find((preset) => preset.id === graph.id)
    if (!original) return
    if (!confirmPresetReset) {
      setConfirmPresetReset(true)
      return
    }
    const reset = cloneArchitectureGraph(original)
    presetDraftsRef.current.set(reset.id, { graph: reset, selectedNodeId: reset.nodes[0]?.id ?? '' })
    setGraph(reset)
    setSelectedNodeId(reset.nodes[0]?.id ?? '')
    setParseDiagnostics([])
    setConfirmPresetReset(false)
  }

  const deleteUserPreset = (preset: ArchitectureGraph) => {
    presetDraftsRef.current.delete(preset.id)
    setUserPresets((current) => current.filter((candidate) => candidate.id !== preset.id))
    if (graph.id === preset.id) {
      const blankDraft = presetDraftsRef.current.get(blankStarterPreset.id)
      setGraph(cloneArchitectureGraph(blankDraft?.graph ?? blankStarterPreset))
      setSelectedNodeId(blankDraft?.selectedNodeId ?? '')
      setParseDiagnostics([])
    }
  }

  const selectPreset = (presetId: string) => {
    const preset = [...builtInModelPresets, ...userPresets].find((candidate) => candidate.id === presetId)
    if (preset) loadPreset(preset, preset.nodes[0]?.id ?? '')
  }

  const addPresetForComparison = (preset: ArchitectureGraph) => {
    const current = latestGraphRef.current
    const usedIds = new Set(current.nodes.map((node) => node.id))
    const sourceArchitectures = architectureComponents(preset)
    const addedNodeIds: string[] = []
    let nextGraph = current
    for (const [componentIndex, architecture] of sourceArchitectures.entries()) {
      let sequence = 1
      let prefix = `${preset.id}-${componentIndex + 1}`
      while (architecture.nodeIds.some((nodeId) => usedIds.has(`${prefix}-${nodeId}`))) prefix = `${preset.id}-${componentIndex + 1}-${++sequence}`
      const remap = new Map(architecture.nodeIds.map((nodeId) => [nodeId, `${prefix}-${nodeId}`]))
      const metadata = {
        laboArchitectureName: architecture.label,
        laboArchitectureHiddenSize: architecture.graph.config.hiddenSize,
        laboArchitectureQueryHeads: architecture.graph.config.queryHeads,
        laboArchitectureKeyValueHeads: architecture.graph.config.keyValueHeads,
        laboArchitectureHeadDim: architecture.graph.config.headDim,
      }
      const nodes = architecture.graph.nodes.map((node) => ({ ...node, id: remap.get(node.id)!, position: { ...node.position }, attributes: { ...node.attributes, ...metadata } }))
      const edges = architecture.graph.edges.map((edge) => ({ ...edge, id: `${prefix}-${edge.id}`, source: remap.get(edge.source)!, target: remap.get(edge.target)! }))
      for (const node of nodes) { usedIds.add(node.id); addedNodeIds.push(node.id) }
      nextGraph = { ...nextGraph, nodes: [...nextGraph.nodes, ...nodes], edges: [...nextGraph.edges, ...edges] }
    }
    nextGraph = layoutParallelArchitecture(nextGraph, addedNodeIds)
    setGraph(nextGraph)
    setSelectedNodeId(addedNodeIds[0] ?? '')
    setInteractionMode('edit')
  }

  const applyAgentGraph = (nextGraph: ArchitectureGraph, actions: AgentGraphAction[]) => {
    const addedNode = nextGraph.nodes.find((node) => !graph.nodes.some((current) => current.id === node.id))
    const generatedCards = nextGraph.nodes.filter((node) => !graph.nodes.some((current) => current.id === node.id) && node.kind === 'custom-pytorch' && node.code && validCustomPyTorchModule(node.code))
    if (generatedCards.length > 0) {
      setCustomCards((current) => {
        const next = [...current]
        for (const node of generatedCards) {
          const inputRole = (node.attributes?.inputRole as TensorRole | undefined) ?? 'hidden'
          const outputRole = node.role
          if (next.some((card) => card.label === node.label && card.code === node.code && (card.inputRole ?? 'hidden') === inputRole && (card.outputRole ?? 'hidden') === outputRole)) continue
          const baseId = node.id.replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'agent-card'
          let id = baseId
          let sequence = 2
          while (next.some((card) => card.id === id)) id = `${baseId}-${sequence++}`
          next.push({ id, label: node.label, code: node.code!, inputRole, outputRole })
        }
        return next
      })
    }
    const run = actions.find((action): action is Extract<AgentGraphAction, { type: 'run' }> => action.type === 'run')
    if (run) pendingAgentRunRef.current = run.mode
    const preset = actions.find((action): action is Extract<AgentGraphAction, { type: 'save-preset' }> => action.type === 'save-preset')
    const appliedGraph = preset ? saveGraphAsPreset(preset.name, nextGraph) ?? nextGraph : nextGraph
    if (!preset) setGraph(appliedGraph)
    if (addedNode) setSelectedNodeId(addedNode.id)
    for (const action of actions) {
      if (action.type !== 'export') continue
      if (action.kind === 'svg' || action.kind === 'both') void exportArchitectureDiagram(appliedGraph)
      if (action.kind === 'python' || action.kind === 'both') {
        const architectures = architectureComponents(appliedGraph, [...builtInModelPresets, ...userPresets])
        for (const architecture of architectures) void exportPyTorchCode(architecture.graph, compileToPyTorch(architecture.graph))
      }
    }
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
    { label: 'Image, video & multimodal', atoms: modelAtoms.filter((definition) => specializedAtom(definition) && definition.category === 'media') },
  ]
  const trBasicIds = new Set(['deterministic-token-routing', 'routed-expert-bank', 'shared-expert-bank', 'branch-gated-merge'])
  const learnedRouterIds = new Set(['moe-router', 'top-k-routing', 'load-balancing-loss', 'router-entropy-loss'])
  const trBasicAtoms = modelAtoms.filter((definition) => trBasicIds.has(definition.id))
  const learnedRouterAtoms = modelAtoms.filter((definition) => learnedRouterIds.has(definition.id))
  const routingRecipeAtoms = modelAtoms.filter((definition) => routingAtom(definition) && !trBasicIds.has(definition.id) && !learnedRouterIds.has(definition.id))
  const atomButton = (definition: ModelAtomDefinition) => <button
    aria-label={`Add ${definition.label}`}
    className="library-block"
    disabled={interactionMode === 'edit'}
    draggable={interactionMode === 'add'}
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
    disabled={interactionMode === 'edit'}
    draggable={interactionMode === 'add'}
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
          <div className="interaction-switcher" aria-label="Canvas interaction mode">
            <button aria-pressed={interactionMode === 'add'} onClick={() => setInteractionMode('add')}><Blocks size={13} />Add blocks</button>
            <button aria-pressed={interactionMode === 'edit'} onClick={() => setInteractionMode('edit')}><Pencil size={13} />Edit cards</button>
            <button aria-haspopup="dialog" onClick={openCardCreator} title="Build a reusable PyTorch card, then choose exactly where it goes"><Code2 size={13} />New reusable card</button>
          </div>
          <details className="preset-menu"><summary>{presetMenuLabels[graph.id] ?? graph.name}</summary><div aria-label="Model preset">{builtInModelPresets.map((preset) => <button aria-pressed={graph.id === preset.id} key={preset.id} onClick={(event) => { selectPreset(preset.id); event.currentTarget.closest('details')?.removeAttribute('open') }}>{presetMenuLabels[preset.id] ?? preset.name}</button>)}{userPresets.map((preset) => <button aria-pressed={graph.id === preset.id} key={preset.id} onClick={(event) => { selectPreset(preset.id); event.currentTarget.closest('details')?.removeAttribute('open') }}>{preset.name}</button>)}</div></details>
          <details className="model-prompt-menu"><summary>Prompt</summary><label className="model-prompt-control"><span>Generation prompt</span><input aria-label="Model generation prompt" onChange={(event) => { setSampleText(event.target.value); setPromptTokenCount(undefined); setModelOutput(undefined) }} value={sampleText} /><small>{acceptsTokenIds ? (promptTokenCount === undefined ? 'Research BPE' : `${promptTokenCount} Token IDs`) : 'Add a Token IDs input'}</small></label></details>
        </div>
        <div className="toolbar-meta">
          <span><span className={`status-dot ${pytorchDraftAvailable || blankGraph ? '' : 'invalid'}`} /> {blankGraph ? 'Blank canvas ready' : pytorchMappingComplete ? 'PyTorch graph executable' : pytorchDraftAvailable ? 'Atomic PyTorch draft' : 'PyTorch compile error'}</span>
          <span>{stats.nodeCount} atoms</span>
          <div className="atomic-player-controls" aria-label="Model atomic player">
            <button aria-label="Auto-arrange graph" disabled={blankGraph} onClick={() => setGraph((current) => layoutArchitectureGraph(current))} title="Arrange execution levels and parallel branches"><span aria-hidden="true">XY</span></button>
            <button aria-label="Play model atoms" disabled={!runtimeAvailable} onClick={() => void modelPlayerRef.current?.play()} title={runtimeAvailable ? undefined : 'Open LABO AI in Electron to execute PyTorch'}><Play size={13} /></button>
            <button aria-label="Pause model atoms" disabled={!runtimeAvailable} onClick={() => modelPlayerRef.current?.pause()}><Pause size={13} /></button>
            <button aria-label="Step one model atom" disabled={!runtimeAvailable} onClick={() => void modelPlayerRef.current?.step()} title={runtimeAvailable ? undefined : 'Open LABO AI in Electron to execute PyTorch'}><StepForward size={13} /></button>
            <button aria-label="Stop model atoms" disabled={!runtimeAvailable} onClick={() => modelPlayerRef.current?.stop()}><Square size={12} /></button>
            <span className={`player-status status-${modelPlayerSnapshot.status}`}>{runtimeAvailable ? modelPlayerSnapshot.status : 'desktop only'}</span>
          </div>
          <button aria-pressed={libraryOpen} className="panel-visibility-button" onClick={() => setLibraryOpen((current) => !current)}><PanelLeft size={13} />Library</button>
          <button aria-pressed={inspectorOpen} className="panel-visibility-button" onClick={() => setInspectorOpen((current) => !current)}><Cpu size={13} />Inspector</button>
          <ExportMenu code={code} codeGraph={codeGraph} graph={graph} />
        </div>
      </section>

      <div className={`workspace-grid ${libraryOpen ? '' : 'library-hidden'} ${inspectorOpen ? '' : 'inspector-hidden'}`}>
        {libraryOpen && <aside className={`block-library mode-${interactionMode}`}>
          <div className="panel-heading"><PanelLeft size={14} /><span>BLOCK LIBRARY</span></div>
          <section className="block-group">
            <details className="library-family graph-input-family">
              <summary>Graph inputs <span>{graphInputDefinitions.length}</span></summary>
              {graphInputDefinitions.map((definition) => <button
                aria-label={`Add ${definition.label}`}
                className="library-block"
                disabled={interactionMode === 'edit'}
                draggable={interactionMode === 'add'}
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
            </details>
            <details className="library-family custom-card-family">
              <summary>My cards <span>{customCards.length}</span></summary>
              {customCards.length > 0 && <div className="custom-card-list">
                {customCards.map((card) => <div className="custom-card-list-row" key={card.id}><button
                  aria-label={`Add ${card.label}`}
                  className="library-block custom-library-block"
                  disabled={interactionMode === 'edit'}
                  draggable={interactionMode === 'add'}
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
                </button><button aria-label={`Delete custom card ${card.label}`} className="delete-custom-library-card" onClick={() => deleteCustomCardDefinition(card.id)} title="Delete card from library"><Trash2 size={12} /></button></div>)}
              </div>}
            </details>
            <details className="library-family generic-atomics-family">
              <summary>Generic atomics <span>{genericAtoms.length}</span></summary>
              {genericAtoms.map(atomButton)}
            </details>
            <details className="library-family specialized-variants-family">
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
            <details className="library-family">
              <summary>Training objectives <span>{objectiveAtoms.length}</span></summary>
              {objectiveAtoms.map(atomButton)}
            </details>
            <details className="library-family">
              <summary>Token-Routed MLP <span>{trBasicAtoms.length}</span></summary>
              {trBasicAtoms.map(atomButton)}
            </details>
            <details className="library-family">
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
        </aside>}

        <section className={`editor-grid view-${view}`}>
          {view !== 'pytorch' && <GraphCanvas editMode={interactionMode === 'edit'} graph={graph} onDeleteNode={deleteGraphCard} onDeleteNodes={deleteGraphCards} onEditNode={openCardEditor} onDropAtom={dropModelAtom} onDropCustom={(cardId, position) => {
            const card = customCards.find((candidate) => candidate.id === cardId)
            if (card) addCustomCard(card, position)
          }} onDropInput={(role, position) => addGraphInput(role, position)} playerSnapshot={modelPlayerSnapshot} selectedNodeId={selectedNodeId} setGraph={setGraph} setSelectedNodeId={setSelectedNodeId} />}

          {view !== 'blocks' && (
            <div className="code-panel">
              <div className="panel-tab"><Code2 size={13} /> generated_attention.py {graphArchitectures.length > 1 && <select aria-label="PyTorch architecture" onChange={(event) => { const architecture = graphArchitectures.find((candidate) => candidate.id === event.target.value); setSelectedArchitectureId(event.target.value); if (architecture?.nodeIds[0]) setSelectedNodeId(architecture.nodeIds[0]) }} value={selectedArchitecture?.id ?? ''}>{graphArchitectures.map((architecture) => <option key={architecture.id} value={architecture.id}>{architecture.label}</option>)}</select>}<span>LABO DIALECT</span><button aria-label="Apply PyTorch to blocks" onClick={applyPyTorch}>Apply to blocks</button></div>
              {blankGraph ? <div className="code-empty-state">
                <span><Code2 size={20} /></span>
                <strong>PyTorch appears with your graph</strong>
                <p>Add the first card to generate an inspectable module. Nothing invalid is emitted for an empty workspace.</p>
                <code>graph → typed IR → PyTorch</code>
              </div> : <PythonCodeEditor onChange={setCodeDraft} value={codeDraft} />}
              {!blankGraph && parseDiagnostics.length > 0 && <div className="code-diagnostics">{parseDiagnostics.map((diagnostic) => <p key={`${diagnostic.nodeId}-${diagnostic.code}`}>{diagnostic.message}</p>)}</div>}
            </div>
          )}
        </section>

        <aside className="inspector" hidden={!inspectorOpen}>
          <div className="panel-heading"><Cpu size={14} /><span>INSPECTOR</span></div>
          <section className="inspector-section">
            <div className="section-title">Selection</div>
            <div className="selection-card">
              <span className="selection-icon"><Zap size={15} /></span>
              <div><strong>{selectedNode?.label ?? selectedGroup?.label ?? 'No selection'}</strong><small>{selectedNode?.id ?? selectedGroup?.id ?? '—'}</small></div>
            </div>
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

      {editingNode && cardEditDraft && <div className="model-card-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closeCardEditor() }}>
        <section aria-label="Edit model card" aria-modal="true" className={`model-card-modal ${editingNode.kind === 'custom-pytorch' ? 'code-card-modal' : ''}`} onPointerDown={(event) => event.stopPropagation()} role="dialog">
          <header><div><span>EDIT MODE</span><strong>{editingNode.label}</strong></div><button aria-label="Close model card editor" onClick={closeCardEditor}><X size={14} /></button></header>
          <p className="model-card-modal-hint">Edit this existing graph card. No new Blockly card is added in this mode.</p>
          <label><span>Name</span><input aria-label="Model card name" onChange={(event) => setCardEditDraft((current) => current ? { ...current, label: event.target.value } : current)} value={cardEditDraft.label} /></label>
          <label><span>Block ID</span><input aria-label="Model card ID" disabled value={editingNode.id} /></label>
          {editingNode.kind === 'custom-pytorch' ? <label className="model-card-code-field"><span>PyTorch module</span><textarea aria-label="Model card PyTorch module" onChange={(event) => setCardEditDraft((current) => current ? { ...current, code: event.target.value } : current)} rows={14} spellCheck={false} value={cardEditDraft.code ?? ''} /></label> : <div className="model-card-modal-settings">
            {modelAtomRegistry[editingNode.atomId ?? '']?.settings.map((setting) => {
              const value = cardEditDraft.attributes?.[setting.id] ?? setting.default
              return <label key={setting.id}><span>{setting.id}</span>{setting.type === 'boolean'
                ? <input aria-label={`Model card setting ${setting.id}`} checked={Boolean(value)} onChange={(event) => setCardEditDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: event.target.checked } } : current)} type="checkbox" />
                : setting.type === 'select'
                  ? <select aria-label={`Model card setting ${setting.id}`} onChange={(event) => setCardEditDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: event.target.value } } : current)} value={String(value)}>{setting.options?.map((option) => <option key={option}>{option}</option>)}</select>
                  : <input aria-label={`Model card setting ${setting.id}`} onChange={(event) => setCardEditDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: setting.type === 'number' ? Number(event.target.value) : event.target.value } } : current)} type={setting.type === 'number' ? 'number' : 'text'} value={String(value)} />}</label>
            })}
          </div>}
          {editingNode.kind === 'custom-pytorch' && <small className={validCustomPyTorchModule(cardEditDraft.code ?? '') ? 'custom-code-valid' : 'custom-code-invalid'}>{validCustomPyTorchModule(cardEditDraft.code ?? '') ? 'Valid safe nn.Module constructor' : 'Invalid or unsupported nn.Module constructor'}</small>}
          {cardEditError && <p className="model-card-modal-error" role="alert">{cardEditError}</p>}
          <footer><button className="model-card-delete" onClick={deleteEditingCard}><Trash2 size={12} />Delete card</button><span /><button onClick={closeCardEditor}>Cancel</button><button className="model-card-save" onClick={saveCardEditor}>Save changes</button></footer>
        </section>
      </div>}

      {createCardOpen && <CustomCardCreator onClose={() => setCreateCardOpen(false)} onCreate={createCustomCard} selectedTarget={selectedNode?.label} />}

      <footer className="statusbar model-statusbar">
      <AskLaboPanel customCards={customCards} dockClassName={`view-${view} ${libraryOpen ? 'library-visible' : ''} ${inspectorOpen ? 'inspector-visible' : ''}`} graph={graph} onApply={applyAgentGraph} onClose={onCloseAsk} open={askOpen} workspaceSettings={<>
        <div className="workspace-management-column">
          <div className="model-preset-builder">
            <div className="workspace-current-target"><span>CURRENT WORKSPACE</span><strong>{presetMenuLabels[graph.id] ?? graph.name}</strong><small>{graph.nodes.length} cards · edits auto-saved for this user</small></div>
            <label><span>Name for the saved copy</span><input aria-label="New model preset name" onChange={(event) => setPresetName(event.target.value)} value={presetName} /></label>
            {presetError && <p role="alert">{presetError}</p>}
            <button aria-label={`Save a named copy of ${presetMenuLabels[graph.id] ?? graph.name}`} onClick={createUserPreset}>Save current graph as a workspace</button>
            <button onClick={createBlankWorkspace}>Create and open a blank workspace</button>
            <button className={`reset-model-preset-button${confirmPresetReset ? ' confirm-reset' : ''}`} disabled={!builtInModelPresets.some((preset) => preset.id === graph.id) && !userPresets.some((preset) => preset.id === graph.id)} onClick={resetCurrentPreset}>{confirmPresetReset ? `Confirm restore ${presetMenuLabels[graph.id] ?? graph.name}` : `Restore ${presetMenuLabels[graph.id] ?? graph.name}`}</button>
            <small>Opening another workspace preserves this draft. Restore discards only the current workspace edits and requires confirmation.</small>
          </div>
          {userPresets.length > 0 && <div className="user-preset-list">
            <strong>YOUR SAVED WORKSPACES</strong>
            {userPresets.map((preset) => <div key={preset.id}>
              <button aria-label={`Load preset ${preset.name}`} aria-pressed={graph.id === preset.id} onClick={() => loadPreset(preset, preset.nodes[0]?.id ?? '')}><strong>{preset.name}</strong><small>{preset.nodes.length} blocks</small></button>
              <button aria-label={`Delete preset ${preset.name}`} onClick={() => deleteUserPreset(preset)} title="Delete workspace"><Trash2 size={12} /></button>
            </div>)}
          </div>}
        </div>
        <div className="preset-comparison-list">
          <strong>ADD FOR COMPARISON</strong>
          <small>Add a complete architecture beside the current graph without switching workspace.</small>
          {[...builtInModelPresets.filter((preset) => preset.nodes.length > 0), ...userPresets.filter((preset) => preset.nodes.length > 0)].map((preset) => <button aria-label={`Add ${presetMenuLabels[preset.id] ?? preset.name} beside current graph`} key={`compare-${preset.id}`} onClick={() => addPresetForComparison(preset)}><strong>+ {presetMenuLabels[preset.id] ?? preset.name}</strong><span>{preset.nodes.length} cards</span></button>)}
        </div>
      </>} />

        <span><span className={`status-dot ${validation.valid || blankGraph ? '' : 'invalid'}`} /> Neural IR {blankGraph ? 'blank' : validation.valid ? 'valid' : 'invalid'}</span>
        <span>{stats.nodeCount} nodes · {stats.edgeCount} links</span>
        <span className="status-spacer" />
        <span>PyTorch 2.7</span>
        <span>LABO Runtime · local</span>
      </footer>
    </>
  )
}
