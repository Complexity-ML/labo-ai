import { useRef, useState, type CSSProperties, type Dispatch, type DragEvent, type PointerEvent, type SetStateAction } from 'react'
import { Blocks, Cable, Maximize2, Minus, Plus, Zap } from 'lucide-react'
import type { AtomicPlayerSnapshot } from '../core/atomic-player'
import { moveGroup, moveNode, type ArchitectureGraph, type ArchitectureNode, type TensorRole } from '../core/ir'
import { modelAtomRegistry } from '../core/model-atoms'
import { useElasticCables, type CablePath, type PortDirection } from './useElasticCables'
import { useGraphViewport } from './useGraphViewport'
import { screenToWorld } from './viewport'
import { MODEL_CARD_HEIGHT, MODEL_CARD_WIDTH, resolveCardDrop } from './card-layout'

function describeNode(node: ArchitectureNode): string {
  if (node.attributes?.inFeatures && node.attributes?.outFeatures) return `${node.attributes.inFeatures} → ${node.attributes.outFeatures}`
  if (node.kind === 'sdpa') return 'causal · SDPA'
  return node.role
}


function CableLayer({ paths, draftPath }: { paths: CablePath[]; draftPath?: { path: string; role: TensorRole } }) {
  return <svg aria-hidden="true" className="graph-connections" viewBox="0 0 4000 4000">
    <defs><marker id="edge-arrow" markerHeight="5" markerWidth="5" orient="auto" refX="4" refY="2.5"><path d="M0,0 L5,2.5 L0,5 Z" /></marker></defs>
    {paths.map((cable) => <path className={`graph-edge edge-${cable.role}`} d={cable.path} data-edge-id={cable.id} key={cable.id} markerEnd="url(#edge-arrow)" />)}
    {draftPath && <path className={`graph-edge cable-draft edge-${draftPath.role}`} d={draftPath.path} />}
  </svg>
}

type PortHandler = (event: PointerEvent<HTMLButtonElement>, nodeId: string, portId: string, role: TensorRole, direction: PortDirection) => void
type NodeDragHandler = (event: PointerEvent<HTMLButtonElement>, node: ArchitectureNode) => void

function Port({ direction, id, portId, nodeId, role, label, className = '', style, onPointerDown }: { direction: PortDirection; id: string; portId?: string; nodeId: string; role: TensorRole; label: string; className?: string; style?: CSSProperties; onPointerDown: PortHandler }) {
  return <button aria-label={`${nodeId} ${direction} ${label}`} className={`block-port port-${direction === 'input' ? 'top' : 'bottom'} port-${role} ${className}`} data-node-id={nodeId} data-port-direction={direction} data-port-id={id} data-port-key={portId ?? role} data-port-role={role} onPointerDown={(event) => onPointerDown(event, nodeId, portId ?? role, role, direction)} style={style} type="button">{label}</button>
}

function NodePorts({ node, onPointerDown }: { node: ArchitectureNode; onPointerDown: PortHandler }) {
  if (node.kind === 'input') {
    const role = node.role === 'token-ids' || node.id.toLowerCase().includes('token') ? 'token-ids' : node.role
    const portId = role === 'token-ids' ? 'tokenIds' : role
    const label = ({ 'token-ids': 'IDs', hidden: 'H', labels: 'Y', query: 'Q', key: 'K', value: 'V', attention: 'A', output: 'O', logits: 'L', scalar: 'S', 'routing-logits': 'R', 'expert-indices': 'I', 'routing-weights': 'W' } as Record<TensorRole, string>)[role]
    return <Port direction="output" id={`${node.id}-${portId}-output`} label={label} nodeId={node.id} onPointerDown={onPointerDown} portId={portId} role={role} />
  }
  if (node.kind === 'semantic' && node.atomId) {
    const definition = modelAtomRegistry[node.atomId]
    if (!definition) return null
    const label = (tensor: TensorRole) => ({ 'token-ids': 'IDs', hidden: 'H', query: 'Q', key: 'K', value: 'V', logits: 'L', labels: 'Y', scalar: 'S', 'routing-logits': 'R', 'expert-indices': 'I', 'routing-weights': 'W', attention: 'A', output: 'O' }[tensor])
    return <>
      {definition.inputs.map((port, index) => <Port direction="input" id={`${node.id}-${port.id}-input`} key={`in-${port.id}`} label={label(port.tensor)} nodeId={node.id} onPointerDown={onPointerDown} portId={port.id} role={port.tensor} style={{ left: `${((index + 1) / (definition.inputs.length + 1)) * 100}%` }} />)}
      {definition.outputs.map((port, index) => <Port direction="output" id={`${node.id}-${port.id}-output`} key={`out-${port.id}`} label={label(port.tensor)} nodeId={node.id} onPointerDown={onPointerDown} portId={port.id} role={port.tensor} style={{ left: `${((index + 1) / (definition.outputs.length + 1)) * 100}%` }} />)}
    </>
  }
  if (node.kind === 'sdpa') return <>
    <Port className="port-third-1" direction="input" id={`${node.id}-query-input`} label="Q" nodeId={node.id} onPointerDown={onPointerDown} role="query" />
    <Port className="port-third-2" direction="input" id={`${node.id}-key-input`} label="K" nodeId={node.id} onPointerDown={onPointerDown} role="key" />
    <Port className="port-third-3" direction="input" id={`${node.id}-value-input`} label="V" nodeId={node.id} onPointerDown={onPointerDown} role="value" />
    <Port direction="output" id={`${node.id}-hidden-output`} label="H" nodeId={node.id} onPointerDown={onPointerDown} role="hidden" />
  </>
  const output = node.role === 'query' ? 'Q' : node.role === 'key' ? 'K' : node.role === 'value' ? 'V' : 'H'
  return <>
    <Port direction="input" id={`${node.id}-hidden-input`} label="H" nodeId={node.id} onPointerDown={onPointerDown} role="hidden" />
    <Port direction="output" id={`${node.id}-${node.role}-output`} label={output} nodeId={node.id} onPointerDown={onPointerDown} role={node.role === 'attention' ? 'hidden' : node.role} />
  </>
}

function ArchitectureNodeCard({ node, selected, status, grouped = false, dragging = false, onSelect, onPortPointerDown, onDragPointerDown }: { node: ArchitectureNode; selected: boolean; status: string; grouped?: boolean; dragging?: boolean; onSelect(): void; onPortPointerDown: PortHandler; onDragPointerDown?: NodeDragHandler }) {
  return <div className={`architecture-node node-${node.role} ${selected ? 'selected' : ''} status-${status} ${grouped ? 'grouped-node' : ''} ${dragging ? 'dragging' : ''}`} data-graph-node="true" data-atom-id={node.atomId} style={grouped ? { overflow: 'visible' } : { left: node.position.x, top: node.position.y, overflow: 'visible' }}>
    <NodePorts node={node} onPointerDown={onPortPointerDown} />
    <button aria-label={`Select ${node.label}`} className="node-select" onClick={onSelect} onPointerDown={(event) => onDragPointerDown?.(event, node)}>
      <span className="node-type">{node.kind}</span><strong>{node.label}</strong><small>{describeNode(node)}</small>
    </button>
  </div>
}

export function GraphCanvas({ graph, setGraph, selectedNodeId, setSelectedNodeId, playerSnapshot, onDropAtom, onDropCustom, onDropInput }: { graph: ArchitectureGraph; setGraph: Dispatch<SetStateAction<ArchitectureGraph>>; selectedNodeId: string; setSelectedNodeId(id: string): void; playerSnapshot: AtomicPlayerSnapshot; onDropAtom(atomId: string, position: { x: number; y: number }): void; onDropCustom(cardId: string, position: { x: number; y: number }): void; onDropInput(inputRole: TensorRole, position: { x: number; y: number }): void }) {
  const qkvGroup = graph.groups?.find((group) => group.kind === 'qkv-projection')
  const qkvNodeIds = new Set(qkvGroup?.nodeIds ?? [])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const camera = useGraphViewport(canvasRef)
  const nodeDrag = useRef<{ pointerId: number; nodeId: string; offsetX: number; offsetY: number; original: { x: number; y: number }; position: { x: number; y: number } } | null>(null)
  const groupDrag = useRef<{ pointerId: number; groupId: string; offsetX: number; offsetY: number; original: { x: number; y: number }; position: { x: number; y: number } } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ nodeId: string; position: { x: number; y: number } } | null>(null)
  const [groupPreview, setGroupPreview] = useState<{ groupId: string; position: { x: number; y: number } } | null>(null)
  const [acceptsLibraryDrop, setAcceptsLibraryDrop] = useState(false)
  const cables = useElasticCables(graph, setGraph, canvasRef, camera.viewport, `${selectedNodeId}:${dragPreview?.nodeId ?? ''}:${dragPreview?.position.x ?? ''}:${dragPreview?.position.y ?? ''}:${groupPreview?.groupId ?? ''}:${groupPreview?.position.x ?? ''}:${groupPreview?.position.y ?? ''}`)

  const beginNodeDrag: NodeDragHandler = (event, node) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const canvas = canvasRef.current
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    const pointer = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, camera.viewport)
    const position = { ...node.position }
    nodeDrag.current = { pointerId: event.pointerId, nodeId: node.id, offsetX: pointer.x - position.x, offsetY: pointer.y - position.y, original: position, position }
    setDragPreview({ nodeId: node.id, position })
    setSelectedNodeId(node.id)
    canvas.setPointerCapture?.(event.pointerId)
  }

  const beginGroupDrag = (event: PointerEvent<HTMLElement>, groupId: string, position: { x: number; y: number }) => {
    if (event.button !== 0 || (event.currentTarget.tagName !== 'BUTTON' && event.currentTarget !== event.target && (event.target as HTMLElement).closest('button'))) return
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    event.stopPropagation()
    const bounds = canvas.getBoundingClientRect()
    const pointer = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, camera.viewport)
    const original = { ...position }
    groupDrag.current = { pointerId: event.pointerId, groupId, offsetX: pointer.x - original.x, offsetY: pointer.y - original.y, original, position: original }
    setGroupPreview({ groupId, position: original })
    setSelectedNodeId(groupId)
    canvas.setPointerCapture?.(event.pointerId)
  }

  const movePointer = (event: PointerEvent<HTMLDivElement>) => {
    const drag = nodeDrag.current
    const movingGroup = groupDrag.current
    if ((!drag || drag.pointerId !== event.pointerId) && (!movingGroup || movingGroup.pointerId !== event.pointerId)) return camera.onPointerMove(event)
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointer = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, camera.viewport)
    if (movingGroup && movingGroup.pointerId === event.pointerId) {
      movingGroup.position = { x: pointer.x - movingGroup.offsetX, y: pointer.y - movingGroup.offsetY }
      setGroupPreview({ groupId: movingGroup.groupId, position: movingGroup.position })
      return
    }
    if (!drag) return
    drag.position = { x: pointer.x - drag.offsetX, y: pointer.y - drag.offsetY }
    setDragPreview({ nodeId: drag.nodeId, position: drag.position })
  }

  const endPointer = (event: PointerEvent<HTMLDivElement>) => {
    const drag = nodeDrag.current
    const movingGroup = groupDrag.current
    if (movingGroup?.pointerId === event.pointerId) {
      groupDrag.current = null
      setGraph((current) => {
        const group = current.groups?.find((candidate) => candidate.id === movingGroup.groupId)
        const width = group?.expanded ? 390 : 340
        const height = group?.expanded ? 130 : 92
        const center = resolveCardDrop({
          id: movingGroup.groupId,
          original: { x: movingGroup.original.x + width / 2, y: movingGroup.original.y + height / 2 },
          desired: { x: movingGroup.position.x + width / 2, y: movingGroup.position.y + height / 2 },
          width,
          height,
        }, current.nodes
          .filter((node) => !qkvNodeIds.has(node.id))
          .map((node) => ({ id: node.id, position: node.position, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT })))
        return moveGroup(current, movingGroup.groupId, { x: center.x - width / 2, y: center.y - height / 2 })
      })
      setGroupPreview(null)
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      return
    }
    if (!drag || drag.pointerId !== event.pointerId) return camera.onPointerUp(event)
    nodeDrag.current = null
    setGraph((current) => {
      const position = resolveCardDrop({
        id: drag.nodeId,
        original: drag.original,
        desired: drag.position,
        width: MODEL_CARD_WIDTH,
        height: MODEL_CARD_HEIGHT,
      }, current.nodes
        .filter((node) => node.id !== drag.nodeId && !qkvNodeIds.has(node.id))
        .map((node) => ({ id: node.id, position: node.position, width: MODEL_CARD_WIDTH, height: MODEL_CARD_HEIGHT })))
      return moveNode(current, drag.nodeId, position)
    })
    setDragPreview(null)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  const cancelPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (nodeDrag.current?.pointerId === event.pointerId) {
      nodeDrag.current = null
      setDragPreview(null)
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      return
    }
    if (groupDrag.current?.pointerId === event.pointerId) {
      groupDrag.current = null
      setGroupPreview(null)
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      return
    }
    camera.onPointerCancel(event)
  }

  const setQkvExpanded = (expanded: boolean) => {
    setGraph((current) => ({ ...current, groups: current.groups?.map((group) => group.kind === 'qkv-projection' ? { ...group, expanded } : group) }))
    setSelectedNodeId(expanded ? 'q-proj' : 'qkv-projections')
  }


  const status = (nodeId: string) => playerSnapshot.results.find((result) => result.atomId === nodeId)?.status ?? 'pending'

  const acceptsAtomDrag = (event: DragEvent<HTMLDivElement>) => event.dataTransfer.types.includes('application/x-labo-model-atom') || event.dataTransfer.types.includes('application/x-labo-graph-input') || event.dataTransfer.types.includes('application/x-labo-custom-card')

  const dragLibraryAtomOver = (event: DragEvent<HTMLDivElement>) => {
    if (!acceptsAtomDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setAcceptsLibraryDrop(true)
  }

  const dropLibraryAtom = (event: DragEvent<HTMLDivElement>) => {
    const atomId = event.dataTransfer.getData('application/x-labo-model-atom')
    const inputRole = event.dataTransfer.getData('application/x-labo-graph-input') as TensorRole
    const customCardId = event.dataTransfer.getData('application/x-labo-custom-card')
    setAcceptsLibraryDrop(false)
    if (!atomId && !inputRole && !customCardId) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointer = screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, camera.viewport)
    const position = { x: pointer.x - MODEL_CARD_WIDTH / 2, y: pointer.y - MODEL_CARD_HEIGHT / 2 }
    if (inputRole) onDropInput(inputRole, position)
    else if (customCardId) onDropCustom(customCardId, position)
    else onDropAtom(atomId, position)
  }

  return <div className="canvas-panel">
    <div className="panel-tab"><Blocks size={13} /> Architecture.graph <span className="cable-help"><Cable size={11} />{cables.message}</span></div>
    <div
      aria-label="Architecture graph canvas"
      className={`architecture-canvas ${camera.isPanning ? 'is-panning' : ''} ${acceptsLibraryDrop ? 'accepts-library-drop' : ''}`}

      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAcceptsLibraryDrop(false)
      }}
      onDragOver={dragLibraryAtomOver}
      onDrop={dropLibraryAtom}
      onKeyDown={camera.onKeyDown}
      onKeyUp={camera.onKeyUp}
      onPointerCancel={cancelPointer}
      onPointerDown={camera.onPointerDown}
      onPointerMove={movePointer}
      onPointerUp={endPointer}
      onWheel={camera.onWheel}
      ref={canvasRef}
      tabIndex={0}
    >
      <div className="graph-world" data-testid="graph-world" style={camera.worldStyle}>
      <div className="canvas-grid" /><CableLayer draftPath={cables.draftPath} paths={cables.paths} />
      {qkvGroup && !qkvGroup.expanded && <div className={`qkv-composite ${selectedNodeId === qkvGroup.id ? 'selected' : ''} ${groupPreview?.groupId === qkvGroup.id ? 'dragging' : ''}`} data-graph-node="true" style={{ left: groupPreview?.groupId === qkvGroup.id ? groupPreview.position.x : qkvGroup.position.x, top: groupPreview?.groupId === qkvGroup.id ? groupPreview.position.y : qkvGroup.position.y }}>
        <Port direction="input" id="qkv-hidden-input" label="H" nodeId="qkv-projections" onPointerDown={cables.beginCable} role="hidden" />
        <Port className="port-third-1" direction="output" id="qkv-query-output" label="Q" nodeId="q-proj" onPointerDown={cables.beginCable} role="query" />
        <Port className="port-third-2" direction="output" id="qkv-key-output" label="K" nodeId="k-proj" onPointerDown={cables.beginCable} role="key" />
        <Port className="port-third-3" direction="output" id="qkv-value-output" label="V" nodeId="v-proj" onPointerDown={cables.beginCable} role="value" />
        <button aria-label="Select QKV projection" className="qkv-select" onClick={() => setSelectedNodeId(qkvGroup.id)} onPointerDown={(event) => beginGroupDrag(event, qkvGroup.id, qkvGroup.position)}><span className="node-type">COMPOSITE · GQA</span><strong>QKV projection</strong><small>Q{graph.config.queryHeads} · KV{graph.config.keyValueHeads} · head {graph.config.headDim}</small></button>

        <button aria-label="Expand QKV projections" className="group-transform-button" onClick={() => setQkvExpanded(true)}>Décomposer en Q / K / V</button>
      </div>}
      {qkvGroup?.expanded && <section className={`qkv-expanded-group ${groupPreview?.groupId === qkvGroup.id ? 'dragging' : ''}`} aria-label="QKV projection group" data-graph-node="true" style={{ left: groupPreview?.groupId === qkvGroup.id ? groupPreview.position.x : qkvGroup.position.x, top: groupPreview?.groupId === qkvGroup.id ? groupPreview.position.y : qkvGroup.position.y }}><div className="qkv-group-header" onPointerDown={(event) => beginGroupDrag(event, qkvGroup.id, qkvGroup.position)}><div><span className="node-type">COMPOSITE · EXPANDED</span><strong>QKV projections</strong></div><button aria-label="Collapse QKV projections" onClick={() => setQkvExpanded(false)}>Regrouper en QKV</button></div><div className="qkv-child-grid">{graph.nodes.filter((node) => qkvNodeIds.has(node.id)).map((node) => <ArchitectureNodeCard grouped key={node.id} node={node} onPortPointerDown={cables.beginCable} onSelect={() => setSelectedNodeId(node.id)} selected={selectedNodeId === node.id} status={status(node.id)} />)}</div></section>}
      {graph.nodes.filter((node) => !qkvNodeIds.has(node.id)).map((node) => {
        const shift = qkvGroup ? (qkvGroup.expanded ? 140 : 55) : 0
        const previewPosition = dragPreview?.nodeId === node.id ? dragPreview.position : node.position
        const displayed = previewPosition.y >= 300 ? { ...node, position: { ...previewPosition, y: previewPosition.y + shift } } : { ...node, position: previewPosition }
        return <ArchitectureNodeCard dragging={dragPreview?.nodeId === node.id} key={node.id} node={displayed} onDragPointerDown={beginNodeDrag} onPortPointerDown={cables.beginCable} onSelect={() => setSelectedNodeId(node.id)} selected={selectedNodeId === node.id} status={status(node.id)} />
      })}
      </div>
      <div className="graph-viewport-controls" aria-label="Graph viewport controls">
        <button aria-label="Zoom out" onClick={camera.zoomOut}><Minus size={13} /></button>
        <button aria-label="Reset zoom" className="zoom-value" onClick={camera.resetZoom}>{Math.round(camera.viewport.zoom * 100)}%</button>
        <button aria-label="Zoom in" onClick={camera.zoomIn}><Plus size={13} /></button>
        <button aria-label="Fit graph" onClick={camera.fitGraph}><Maximize2 size={13} /></button>
      </div>
      <div className="canvas-badge"><Zap size={12} /> {graph.architecture} · {graph.contracts.causal ? 'causal' : 'non-causal'}</div>
    </div>
  </div>
}
