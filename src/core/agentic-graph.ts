import { connectCable, inferredEdgeTargetPort } from './cables'
import { executionLayers } from './execution-plan'
import { findOpenGraphPosition } from './graph-placement'
import { addNode, type ArchitectureGraph, type ArchitectureNode, type TensorRole } from './ir'
import { modelAtomRegistry, type ModelAtomDefinition } from './model-atoms'

export interface AgentPortSnapshot {
  id: string
  tensor: TensorRole
}

export interface AgentNodeSnapshot {
  id: string
  atomId?: string
  label: string
  inputs: AgentPortSnapshot[]
  outputs: AgentPortSnapshot[]
}

export interface AgentConnectionProposal {
  sourceId: string
  sourcePortId: string
  targetId: string
  targetPortId: string
  reason: string
}

export interface AgentBlockProposal {
  atomId: string
  nodeId: string
  reason: string
}

export interface AgentMissingBlock {
  atomId: string | null
  label: string
  reason: string
}

export interface AgentGraphPlan {
  summary: string
  addedBlocks: AgentBlockProposal[]
  connections: AgentConnectionProposal[]
  missingBlocks: AgentMissingBlock[]
  warnings: string[]
}

export interface RejectedAgentBlock {
  block: AgentBlockProposal
  reason: string
}

export interface RejectedAgentConnection {
  connection: AgentConnectionProposal
  reason: string
}

export interface AgentGraphPreview {
  graph: ArchitectureGraph
  acceptedBlocks: AgentBlockProposal[]
  rejectedBlocks: RejectedAgentBlock[]
  accepted: AgentConnectionProposal[]
  rejected: RejectedAgentConnection[]
}

function uniquePorts(ports: AgentPortSnapshot[]): AgentPortSnapshot[] {
  return [...new Map(ports.map((port) => [`${port.id}:${port.tensor}`, port])).values()]
}

function fallbackOutput(node: ArchitectureNode): AgentPortSnapshot {
  if (node.id.toLowerCase().includes('token')) return { id: 'tokenIds', tensor: 'token-ids' }
  return { id: 'output', tensor: node.role === 'attention' ? 'attention' : node.role }
}

function snapshotNode(graph: ArchitectureGraph, node: ArchitectureNode): AgentNodeSnapshot {
  const definition = node.atomId ? modelAtomRegistry[node.atomId] : undefined
  const edgeInputs = graph.edges
    .filter((edge) => edge.target === node.id)
    .map((edge) => ({ id: edge.targetPort ?? inferredEdgeTargetPort(graph, edge), tensor: inferredEdgeTargetPort(graph, edge) }))
  const edgeOutputs = graph.edges
    .filter((edge) => edge.source === node.id)
    .map((edge) => ({ id: edge.sourcePort ?? fallbackOutput(node).id, tensor: sourceTensor(graph, node, edge.sourcePort) }))

  return {
    id: node.id,
    ...(node.atomId ? { atomId: node.atomId } : {}),
    label: node.label,
    inputs: definition ? definition.inputs.map(({ id, tensor }) => ({ id, tensor })) : uniquePorts(edgeInputs),
    outputs: definition ? definition.outputs.map(({ id, tensor }) => ({ id, tensor })) : uniquePorts(edgeOutputs.length > 0 ? edgeOutputs : [fallbackOutput(node)]),
  }
}

function sourceTensor(graph: ArchitectureGraph, node: ArchitectureNode, portId?: string): TensorRole {
  const definition = node.atomId ? modelAtomRegistry[node.atomId] : undefined
  const port = definition?.outputs.find((candidate) => candidate.id === portId)
  if (port) return port.tensor
  if (node.id.toLowerCase().includes('token') || portId === 'tokenIds') return 'token-ids'
  const connected = graph.edges.find((edge) => edge.source === node.id && edge.sourcePort === portId)
  if (connected?.targetPort) {
    const target = graph.nodes.find((candidate) => candidate.id === connected.target)
    const targetPort = target?.atomId ? modelAtomRegistry[target.atomId]?.inputs.find((candidate) => candidate.id === connected.targetPort) : undefined
    if (targetPort) return targetPort.tensor
  }
  return node.role === 'attention' ? 'attention' : node.role
}

export function createAgentGraphContext(graph: ArchitectureGraph) {
  return {
    graph: {
      id: graph.id,
      name: graph.name,
      nodes: graph.nodes.map((node) => snapshotNode(graph, node)),
      connections: graph.edges.map((edge) => ({
        sourceId: edge.source,
        sourcePortId: edge.sourcePort ?? 'output',
        targetId: edge.target,
        targetPortId: edge.targetPort ?? inferredEdgeTargetPort(graph, edge),
      })),
    },
    availableAtomics: Object.values(modelAtomRegistry).filter((definition) => !definition.composite).map((definition) => ({
      atomId: definition.id,
      label: definition.label,
      inputs: definition.inputs.map(({ id, tensor }) => ({ id, tensor })),
      outputs: definition.outputs.map(({ id, tensor }) => ({ id, tensor })),
    })),
  }
}

function roleForDefinition(definition: ModelAtomDefinition): TensorRole {
  const output = definition.outputs[0]?.tensor
  if (output === 'query' || output === 'key' || output === 'value') return output
  if (output === 'logits' || output === 'scalar') return 'output'
  return 'hidden'
}

function agentNode(definition: ModelAtomDefinition, nodeId: string, position: { x: number; y: number }): ArchitectureNode {
  return {
    id: nodeId,
    kind: 'semantic',
    atomId: definition.id,
    label: definition.label,
    role: roleForDefinition(definition),
    position,
    attributes: Object.fromEntries(definition.settings.map((setting) => [setting.id, setting.default])),
  }
}

function targetHasConnection(graph: ArchitectureGraph, targetId: string, targetPortId: string): boolean {
  return graph.edges.some((edge) => edge.target === targetId && (edge.targetPort ?? inferredEdgeTargetPort(graph, edge)) === targetPortId)
}

export function previewAgentGraphPlan(graph: ArchitectureGraph, plan: AgentGraphPlan): AgentGraphPreview {
  let nextGraph = graph
  const acceptedBlocks: AgentBlockProposal[] = []
  const rejectedBlocks: RejectedAgentBlock[] = []
  const accepted: AgentConnectionProposal[] = []
  const rejected: RejectedAgentConnection[] = []

  for (const block of plan.addedBlocks.slice(0, 24)) {
    const definition = modelAtomRegistry[block.atomId]
    if (!definition) {
      rejectedBlocks.push({ block, reason: 'Atomic block is not available in the LABO library' })
      continue
    }
    if (definition.composite) {
      rejectedBlocks.push({ block, reason: 'Composite recipes must be expanded into their atomic blocks' })
      continue
    }
    if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(block.nodeId)) {
      rejectedBlocks.push({ block, reason: 'Block id must start with a letter and contain only letters, numbers, or hyphens' })
      continue
    }
    if (nextGraph.nodes.some((node) => node.id === block.nodeId)) {
      rejectedBlocks.push({ block, reason: `Block id ${block.nodeId} already exists` })
      continue
    }
    nextGraph = addNode(nextGraph, agentNode(definition, block.nodeId, findOpenGraphPosition(nextGraph)))
    acceptedBlocks.push(block)
  }
  if (plan.addedBlocks.length > 24) {
    for (const block of plan.addedBlocks.slice(24)) rejectedBlocks.push({ block, reason: 'A single agent plan can add at most 24 blocks' })
  }

  for (const connection of plan.connections) {
    const source = nextGraph.nodes.find((node) => node.id === connection.sourceId)
    const target = nextGraph.nodes.find((node) => node.id === connection.targetId)
    if (!source || !target) {
      rejected.push({ connection, reason: 'Unknown source or target block' })
      continue
    }
    if (source.id === target.id) {
      rejected.push({ connection, reason: 'A block cannot connect to itself' })
      continue
    }

    const sourcePort = snapshotNode(nextGraph, source).outputs.find((port) => port.id === connection.sourcePortId)
    const targetPort = snapshotNode(nextGraph, target).inputs.find((port) => port.id === connection.targetPortId)
    if (!sourcePort || !targetPort) {
      rejected.push({ connection, reason: 'Unknown source or target port' })
      continue
    }
    if (sourcePort.tensor !== targetPort.tensor) {
      rejected.push({ connection, reason: `${sourcePort.tensor} cannot plug into ${targetPort.tensor}` })
      continue
    }
    if (targetHasConnection(nextGraph, target.id, targetPort.id)) {
      rejected.push({ connection, reason: `${target.id}.${targetPort.id} is already connected` })
      continue
    }

    const outcome = connectCable(nextGraph, {
      sourceId: source.id,
      sourcePort: sourcePort.tensor,
      sourcePortId: sourcePort.id,
      targetId: target.id,
      targetPort: targetPort.tensor,
      targetPortId: targetPort.id,
    })
    if (!outcome.ok) {
      rejected.push({ connection, reason: outcome.message })
      continue
    }
    try {
      executionLayers(outcome.graph)
    } catch {
      rejected.push({ connection, reason: 'Connection would create a cycle' })
      continue
    }
    nextGraph = outcome.graph
    accepted.push(connection)
  }

  return { graph: nextGraph, acceptedBlocks, rejectedBlocks, accepted, rejected }
}
