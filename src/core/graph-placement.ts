import type { ArchitectureGraph, ArchitectureNode } from './ir'
import { executionLayers } from './execution-plan'
import { modelAtomRegistry } from './model-atoms'

const horizontalStep = 180
const verticalStep = 125
const horizontalClearance = 165
const verticalClearance = 112

export function findOpenGraphPosition(graph: ArchitectureGraph): { x: number; y: number } {
  const startX = 35
  const startY = 55
  const columns = 8

  for (let row = 0; row < 120; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidate = { x: startX + column * horizontalStep, y: startY + row * verticalStep }
      const occupied = graph.nodes.some((node) => (
        Math.abs(node.position.x - candidate.x) < horizontalClearance
        && Math.abs(node.position.y - candidate.y) < verticalClearance
      ))
      if (!occupied) return candidate
    }
  }

  return {
    x: Math.max(startX, ...graph.nodes.map((node) => node.position.x)) + horizontalStep,
    y: startY,
  }
}

const layoutHorizontalStep = 190
const layoutVerticalStep = 145
const layoutStartX = 70
const layoutStartY = 70
const layoutColumns = 4

function functionalLane(node: ArchitectureNode): number {
  if (node.kind === 'input') return 0
  if (node.kind === 'custom-pytorch') return 4.5
  const definition = node.atomId ? modelAtomRegistry[node.atomId] : undefined
  if (!definition) return 3
  if (definition.category === 'embedding') return 0.5
  if (definition.category === 'normalization') return 1
  if (definition.category === 'position' || definition.id === 'qk-normalization' || definition.id === 'gqa-kv-expand') return 2
  if (definition.category === 'attention') {
    if (definition.id === 'qkv-projection' || definition.id === 'attention-head-layout') return 1.5
    if (definition.id === 'merge-attention-heads' || definition.id === 'attention-output-projection') return 3
    return 2.5
  }
  if (definition.category === 'composition') return 3.5
  if (definition.category === 'routing') return 4
  if (definition.category === 'mlp' || definition.category === 'activation') return 4.5
  if (definition.category === 'output') return 5
  if (definition.category === 'objective') return 5.5
  return 3
}

function layerPositions(graph: ArchitectureGraph, ids: string[], baseX: number, y: number): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const laneGroups = new Map<number, string[]>()
  for (const id of ids) {
    const node = graph.nodes.find((candidate) => candidate.id === id)
    const lane = node ? functionalLane(node) : 3
    laneGroups.set(lane, [...(laneGroups.get(lane) ?? []), id])
  }
  for (const [lane, laneIds] of laneGroups) {
    const center = baseX + lane * layoutHorizontalStep
    const start = center - ((laneIds.length - 1) * layoutHorizontalStep) / 2
    laneIds.forEach((id, index) => positions.set(id, { x: start + index * layoutHorizontalStep, y }))
  }
  return positions
}

function collides(position: { x: number; y: number }, occupied: Array<{ x: number; y: number }>): boolean {
  return occupied.some((other) => (
    Math.abs(other.x - position.x) < horizontalClearance
    && Math.abs(other.y - position.y) < verticalClearance
  ))
}

/** Arrange a DAG by execution level while leaving nodes outside nodeIds untouched. */
export function layoutArchitectureGraph(graph: ArchitectureGraph, nodeIds?: Iterable<string>): ArchitectureGraph {
  const arranged = new Set(nodeIds ?? graph.nodes.map((node) => node.id))
  if (arranged.size === 0) return graph

  let layers: string[][]
  try {
    layers = executionLayers(graph)
  } catch {
    return graph
  }

  const occupied = graph.nodes.filter((node) => !arranged.has(node.id)).map((node) => ({ ...node.position }))
  const positions = new Map<string, { x: number; y: number }>()
  let bandY = layoutStartY

  for (const layer of layers) {
    const layerNodes = layer.filter((id) => arranged.has(id))
    const rows = Math.max(1, Math.ceil(layerNodes.length / layoutColumns))

    for (let row = 0; row < rows; row += 1) {
      const rowNodes = layerNodes.slice(row * layoutColumns, (row + 1) * layoutColumns)
      const preferred = layerPositions(graph, rowNodes, layoutStartX, bandY + row * layoutVerticalStep)

      for (const id of rowNodes) {
        let position = preferred.get(id)!
        while (collides(position, occupied)) position = { ...position, x: position.x + layoutHorizontalStep }
        positions.set(id, position)
        occupied.push(position)
      }
    }

    bandY += rows * layoutVerticalStep
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node),
  }
}

/** Place a newly-created disconnected architecture beside existing user work. */
export function layoutParallelArchitecture(graph: ArchitectureGraph, nodeIds: Iterable<string>): ArchitectureGraph {
  const arranged = new Set(nodeIds)
  if (arranged.size === 0) return graph

  const existing = graph.nodes.filter((node) => !arranged.has(node.id))
  const branch = {
    ...graph,
    nodes: graph.nodes.filter((node) => arranged.has(node.id)),
    edges: graph.edges.filter((edge) => arranged.has(edge.source) && arranged.has(edge.target)),
    groups: [],
  }
  let layers: string[][]
  try {
    layers = executionLayers(branch)
  } catch {
    return graph
  }

  const baseX = existing.length > 0 ? Math.max(...existing.map((node) => node.position.x)) + layoutHorizontalStep * 1.5 : layoutStartX
  const baseY = existing.length > 0 ? Math.min(...existing.map((node) => node.position.y)) : layoutStartY
  const positions = new Map<string, { x: number; y: number }>()
  let bandY = baseY

  for (const layer of layers) {
    const rows = Math.max(1, Math.ceil(layer.length / layoutColumns))
    for (let row = 0; row < rows; row += 1) {
      const rowNodes = layer.slice(row * layoutColumns, (row + 1) * layoutColumns)
      const preferred = layerPositions(graph, rowNodes, baseX, bandY + row * layoutVerticalStep)
      for (const id of rowNodes) positions.set(id, preferred.get(id)!)
    }
    bandY += rows * layoutVerticalStep
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node),
  }
}
