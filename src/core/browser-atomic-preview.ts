import type { ArchitectureGraph, ArchitectureNode, TensorRole } from './ir'
import { modelAtomRegistry, type AtomPort } from './model-atoms'

const inputRanks: Partial<Record<TensorRole, number>> = {
  'token-ids': 2,
  labels: 2,
  image: 4,
  video: 5,
  hidden: 3,
}

function portTensor(role: TensorRole): AtomPort['tensor'] {
  return role === 'output' ? 'hidden' : role
}

function outputPorts(node: ArchitectureNode): AtomPort[] {
  if (node.kind === 'input') {
    return [{
      id: node.role === 'token-ids' ? 'tokenIds' : node.role,
      tensor: portTensor(node.role),
      rank: inputRanks[node.role],
    }]
  }
  if (node.atomId && modelAtomRegistry[node.atomId]) return modelAtomRegistry[node.atomId].outputs
  return [{ id: 'output', tensor: portTensor(node.role), rank: inputRanks[node.role] }]
}

function missingInputs(graph: ArchitectureGraph, node: ArchitectureNode): AtomPort[] {
  const definition = node.atomId ? modelAtomRegistry[node.atomId] : undefined
  const inputs: AtomPort[] = definition?.inputs ?? (node.kind === 'custom-pytorch'
    ? [{ id: node.attributes?.inputRole === 'hidden' || !node.attributes?.inputRole ? 'hidden' : 'input', tensor: portTensor((node.attributes?.inputRole as TensorRole | undefined) ?? 'hidden') }]
    : [])
  return inputs.filter((port) => !graph.edges.some((edge) => edge.target === node.id
    && (edge.targetPort === port.id || (!edge.targetPort && inputs.length === 1))))
}

/**
 * Runs typed graph contracts in browsers, which do not ship a local Python
 * process. Electron continues to execute the exact generated PyTorch program.
 */
export async function previewModelAtom(graph: ArchitectureGraph, atomId: string): Promise<{ summary: string }> {
  const node = graph.nodes.find((candidate) => candidate.id === atomId)
  if (!node) throw new Error(`Unknown graph card: ${atomId}`)

  const missing = missingInputs(graph, node)
  if (missing.length > 0) throw new Error(`Missing ${missing.map((port) => port.id).join(' + ')} input on ${node.label}`)

  const outputs = outputPorts(node).map((port) => `${port.tensor}${port.rank === undefined ? '' : ` · rank ${port.rank}`}`)
  return { summary: `Graph preview · ${node.label} → ${outputs.join(' + ') || 'complete'}` }
}
