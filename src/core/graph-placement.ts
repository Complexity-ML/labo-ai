import type { ArchitectureGraph, ArchitectureNode } from './ir'
import { executionLayers } from './execution-plan'
import { modelAtomRegistry } from './model-atoms'

const cardWidth = 148
const cardHeight = 76
const horizontalGap = 72
const verticalGap = 74
const horizontalStep = cardWidth + horizontalGap
const verticalStep = cardHeight + verticalGap
const layoutStartX = 70
const layoutStartY = 80
const componentGap = 150

type Position = { x: number; y: number }

function familyOrder(node: ArchitectureNode): number {
  if (node.kind === 'input') return 0
  if (node.kind === 'custom-pytorch') return 70
  const definition = node.atomId ? modelAtomRegistry[node.atomId] : undefined
  const category = definition?.category
  return ({ embedding: 10, position: 20, normalization: 30, attention: 40, routing: 50, mlp: 60, activation: 61, composition: 70, output: 80, objective: 90 } as Record<string, number>)[category ?? ''] ?? 65
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function connectedComponents(graph: ArchitectureGraph, nodeIds: Set<string>): string[][] {
  const index = new Map(graph.nodes.map((node, position) => [node.id, position]))
  const neighbours = new Map([...nodeIds].map((id) => [id, new Set<string>()]))
  for (const edge of graph.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      neighbours.get(edge.source)?.add(edge.target)
      neighbours.get(edge.target)?.add(edge.source)
    }
  }
  const pending = new Set(nodeIds)
  const components: string[][] = []
  while (pending.size > 0) {
    const seed = [...pending].sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0))[0]!
    const queue = [seed]
    const component: string[] = []
    pending.delete(seed)
    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)
      for (const neighbour of neighbours.get(current) ?? []) {
        if (!pending.delete(neighbour)) continue
        queue.push(neighbour)
      }
    }
    component.sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0))
    components.push(component)
  }
  return components
}

function componentGraph(graph: ArchitectureGraph, ids: Set<string>): ArchitectureGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    groups: [],
  }
}

function longestPathLayers(graph: ArchitectureGraph): string[][] {
  const topological = executionLayers(graph).flat()
  const rank = new Map(graph.nodes.map((node) => [node.id, 0]))
  for (const source of topological) {
    const sourceRank = rank.get(source) ?? 0
    for (const edge of graph.edges.filter((candidate) => candidate.source === source)) {
      rank.set(edge.target, Math.max(rank.get(edge.target) ?? 0, sourceRank + 1))
    }
  }
  const layers: string[][] = []
  for (const id of topological) {
    const level = rank.get(id) ?? 0
    ;(layers[level] ??= []).push(id)
  }
  return layers
}

function centeredOrderPositions(layers: string[][]): Map<string, number> {
  const positions = new Map<string, number>()
  for (const layer of layers) layer.forEach((id, index) => positions.set(id, index - (layer.length - 1) / 2))
  return positions
}

/** Repeated barycentric sweeps reduce crossings without making the result depend on old X/Y coordinates. */
function orderLayers(graph: ArchitectureGraph, layers: string[][]): string[][] {
  const nodeIndex = new Map(graph.nodes.map((node, index) => [node.id, index]))
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  const outgoing = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of graph.edges) {
    incoming.get(edge.target)?.push(edge.source)
    outgoing.get(edge.source)?.push(edge.target)
  }
  const ordered = layers.map((layer) => [...layer].sort((left, right) => {
    const family = familyOrder(nodeById.get(left)!) - familyOrder(nodeById.get(right)!)
    return family || (nodeIndex.get(left) ?? 0) - (nodeIndex.get(right) ?? 0)
  }))

  const sweep = (direction: 'down' | 'up') => {
    const levels = direction === 'down'
      ? Array.from({ length: ordered.length - 1 }, (_, index) => index + 1)
      : Array.from({ length: ordered.length - 1 }, (_, index) => ordered.length - index - 2)
    for (const level of levels) {
      const positions = centeredOrderPositions(ordered)
      const neighbours = direction === 'down' ? incoming : outgoing
      const previous = new Map(ordered[level]!.map((id, index) => [id, index]))
      ordered[level]!.sort((left, right) => {
        const leftNeighbours = neighbours.get(left) ?? []
        const rightNeighbours = neighbours.get(right) ?? []
        const leftScore = leftNeighbours.length > 0 ? mean(leftNeighbours.map((id) => positions.get(id) ?? 0)) : previous.get(left) ?? 0
        const rightScore = rightNeighbours.length > 0 ? mean(rightNeighbours.map((id) => positions.get(id) ?? 0)) : previous.get(right) ?? 0
        if (Math.abs(leftScore - rightScore) > 1e-6) return leftScore - rightScore
        const family = familyOrder(nodeById.get(left)!) - familyOrder(nodeById.get(right)!)
        return family || (nodeIndex.get(left) ?? 0) - (nodeIndex.get(right) ?? 0)
      })
    }
  }

  for (let pass = 0; pass < 6; pass += 1) {
    sweep('down')
    sweep('up')
  }
  return ordered
}

function separatedLayer(ids: string[], desired: Map<string, number>): Map<string, number> {
  const result = new Map<string, number>()
  let previous = Number.NEGATIVE_INFINITY
  for (const id of ids) {
    const x = Math.max(desired.get(id) ?? 0, previous + horizontalStep)
    result.set(id, x)
    previous = x
  }
  const shift = mean([...result.values()]) - mean(ids.map((id) => desired.get(id) ?? 0))
  for (const [id, x] of result) result.set(id, x - shift)
  return result
}

function layoutComponent(graph: ArchitectureGraph): { positions: Map<string, Position>; width: number; height: number } {
  const layers = orderLayers(graph, longestPathLayers(graph))
  const incoming = new Map(graph.nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of graph.edges) incoming.get(edge.target)?.push(edge.source)
  const x = new Map<string, number>()

  layers.forEach((layer) => {
    const desired = new Map<string, number>()
    for (const [index, id] of layer.entries()) {
      const parentX = (incoming.get(id) ?? []).map((parent) => x.get(parent)).filter((value): value is number => value !== undefined)
      desired.set(id, parentX.length > 0 ? mean(parentX) : (index - (layer.length - 1) / 2) * horizontalStep)
    }
    for (const [id, position] of separatedLayer(layer, desired)) x.set(id, position)
  })

  const minX = Math.min(...x.values())
  const maxX = Math.max(...x.values()) + cardWidth
  const positions = new Map<string, Position>()
  layers.forEach((layer, level) => layer.forEach((id) => positions.set(id, { x: (x.get(id) ?? 0) - minX, y: level * verticalStep })))
  return { positions, width: maxX - minX, height: Math.max(cardHeight, layers.length * verticalStep - verticalGap) }
}

function collides(position: Position, occupied: Position[]): boolean {
  return occupied.some((other) => Math.abs(other.x - position.x) < cardWidth + 22 && Math.abs(other.y - position.y) < cardHeight + 30)
}

function groupPositions(graph: ArchitectureGraph, positions: Map<string, Position>, arranged: Set<string>) {
  return graph.groups?.map((group) => {
    const children = group.nodeIds.filter((id) => arranged.has(id)).map((id) => positions.get(id)).filter((position): position is Position => Boolean(position))
    if (children.length === 0) return group
    const center = mean(children.map((position) => position.x + cardWidth / 2))
    return { ...group, position: { x: center - 170, y: Math.min(...children.map((position) => position.y)) - 55 } }
  })
}

export function findOpenGraphPosition(graph: ArchitectureGraph): Position {
  if (graph.nodes.length === 0) return { x: 35, y: 55 }
  const connected = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]))
  const structural = graph.nodes.filter((node) => connected.has(node.id))
  const baseX = structural.length > 0 ? Math.max(...structural.map((node) => node.position.x)) + horizontalStep + 40 : 35
  const baseY = structural.length > 0 ? Math.min(...structural.map((node) => node.position.y)) : 55
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 80; row += 1) {
      const candidate = { x: baseX + column * horizontalStep, y: baseY + row * verticalStep }
      if (!collides(candidate, graph.nodes.map((node) => node.position))) return candidate
    }
  }
  return { x: baseX + horizontalStep * 4, y: baseY }
}

/** Deterministic compact DAG layout: Y is the longest-path rank and X follows parallel topology. */
export function layoutArchitectureGraph(graph: ArchitectureGraph, nodeIds?: Iterable<string>): ArchitectureGraph {
  const arranged = new Set(nodeIds ?? graph.nodes.map((node) => node.id))
  if (arranged.size === 0) return graph
  try {
    executionLayers(graph)
  } catch {
    return graph
  }

  const external = graph.nodes.filter((node) => !arranged.has(node.id))
  const occupied = external.map((node) => ({ ...node.position }))
  const positions = new Map<string, Position>()
  const components = connectedComponents(graph, arranged)
  let fullCursorX = layoutStartX

  for (const componentIds of components) {
    const ids = new Set(componentIds)
    const local = layoutComponent(componentGraph(graph, ids))
    const incomingAnchors = graph.edges.filter((edge) => !arranged.has(edge.source) && ids.has(edge.target)).map((edge) => graph.nodes.find((node) => node.id === edge.source)!).filter(Boolean)
    const anchorX = incomingAnchors.length > 0 ? mean(incomingAnchors.map((node) => node.position.x)) : undefined
    const baseY = incomingAnchors.length > 0 ? Math.max(...incomingAnchors.map((node) => node.position.y)) + verticalStep : layoutStartY
    let baseX = external.length === 0 ? fullCursorX : anchorX !== undefined ? anchorX - local.width / 2 + cardWidth / 2 : Math.max(layoutStartX, ...external.map((node) => node.position.x + cardWidth + componentGap))

    if (external.length > 0) {
      const candidates = [0, 1, -1, 2, -2, 3, -3, 4]
      const clearOffset = candidates.find((step) => [...local.positions.values()].every((position) => !collides({ x: position.x + baseX + step * horizontalStep, y: position.y + baseY }, occupied))) ?? 4
      baseX += clearOffset * horizontalStep
    }
    for (const [id, position] of local.positions) {
      const placed = { x: position.x + baseX, y: position.y + baseY }
      positions.set(id, placed)
      occupied.push(placed)
    }
    if (external.length === 0) fullCursorX += local.width + componentGap
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node),
    groups: groupPositions(graph, positions, arranged),
  }
}

/** Pack one or more newly-created architectures to the right of existing user work. */
export function layoutParallelArchitecture(graph: ArchitectureGraph, nodeIds: Iterable<string>): ArchitectureGraph {
  const arranged = new Set(nodeIds)
  if (arranged.size === 0) return graph
  const branch = componentGraph(graph, arranged)
  let arrangedBranch: ArchitectureGraph
  try {
    arrangedBranch = layoutArchitectureGraph(branch)
  } catch {
    return graph
  }
  const existing = graph.nodes.filter((node) => !arranged.has(node.id))
  const branchMinX = Math.min(...arrangedBranch.nodes.map((node) => node.position.x))
  const branchMinY = Math.min(...arrangedBranch.nodes.map((node) => node.position.y))
  const targetX = existing.length > 0 ? Math.max(...existing.map((node) => node.position.x)) + cardWidth + componentGap : layoutStartX
  const targetY = existing.length > 0 ? Math.min(...existing.map((node) => node.position.y)) : layoutStartY
  const positions = new Map(arrangedBranch.nodes.map((node) => [node.id, { x: node.position.x - branchMinX + targetX, y: node.position.y - branchMinY + targetY }]))
  return {
    ...graph,
    nodes: graph.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node),
    groups: groupPositions(graph, positions, arranged),
  }
}
