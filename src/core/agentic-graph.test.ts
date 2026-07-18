import { describe, expect, it } from 'vitest'
import { createAgentGraphContext, previewAgentGraphPlan, type AgentGraphPlan } from './agentic-graph'
import { tokenMoePreset } from './presets'

const plan = (connections: AgentGraphPlan['connections'], addedBlocks: AgentGraphPlan['addedBlocks'] = []): AgentGraphPlan => ({
  summary: 'Connect the existing blocks',
  addedBlocks,
  connections,
  missingBlocks: [],
  warnings: [],
})

describe('agentic graph wiring', () => {
  it('describes semantic blocks and their typed ports', () => {
    const context = createAgentGraphContext(tokenMoePreset)
    const routed = context.graph.nodes.find((node) => node.id === 'routed')

    expect(routed?.inputs).toEqual(expect.arrayContaining([
      { id: 'hidden', tensor: 'hidden' },
      { id: 'expertIndices', tensor: 'expert-indices' },
      { id: 'expertWeights', tensor: 'routing-weights' },
    ]))
    expect(context.availableAtomics.some((atomic) => atomic.atomId === 'top-k-routing')).toBe(true)
  })

  it('previews a valid missing elastic without mutating the original graph', () => {
    const graph = { ...tokenMoePreset, edges: tokenMoePreset.edges.filter((edge) => edge.id !== 'router-topk') }
    const preview = previewAgentGraphPlan(graph, plan([{
      sourceId: 'router', sourcePortId: 'scores', targetId: 'topk', targetPortId: 'scores', reason: 'Route scores into selection',
    }]))

    expect(graph.edges).toHaveLength(10)
    expect(preview.accepted).toHaveLength(1)
    expect(preview.graph.edges).toHaveLength(11)
    expect(preview.graph.edges).toContainEqual(expect.objectContaining({ source: 'router', sourcePort: 'scores', target: 'topk', targetPort: 'scores' }))
  })

  it('adds a library atomic before wiring it to an existing block', () => {
    const preview = previewAgentGraphPlan(tokenMoePreset, plan([{
      sourceId: 'norm', sourcePortId: 'output', targetId: 'agent-relu', targetPortId: 'hidden', reason: 'Activate normalized hidden states',
    }], [{ atomId: 'relu', nodeId: 'agent-relu', reason: 'The requested activation is not on the canvas' }]))

    expect(tokenMoePreset.nodes.some((node) => node.id === 'agent-relu')).toBe(false)
    expect(preview.acceptedBlocks).toHaveLength(1)
    expect(preview.accepted).toHaveLength(1)
    expect(preview.graph.nodes).toContainEqual(expect.objectContaining({ id: 'agent-relu', atomId: 'relu', kind: 'semantic' }))
    expect(preview.graph.edges).toContainEqual(expect.objectContaining({ source: 'norm', target: 'agent-relu', targetPort: 'hidden' }))
  })

  it('rejects unavailable, composite, and duplicate agent blocks', () => {
    const preview = previewAgentGraphPlan(tokenMoePreset, plan([], [
      { atomId: 'not-in-library', nodeId: 'unknown-atomic', reason: 'Unavailable' },
      { atomId: 'deepseek-moe', nodeId: 'composite-recipe', reason: 'Composite' },
      { atomId: 'rms-norm', nodeId: 'norm', reason: 'Duplicate id' },
    ]))

    expect(preview.acceptedBlocks).toHaveLength(0)
    expect(preview.rejectedBlocks.map(({ reason }) => reason)).toEqual([
      expect.stringContaining('not available'),
      expect.stringContaining('Composite recipes'),
      expect.stringContaining('already exists'),
    ])
  })

  it('rejects occupied, incompatible, and cyclic connections', () => {
    const occupied = previewAgentGraphPlan(tokenMoePreset, plan([{
      sourceId: 'router', sourcePortId: 'scores', targetId: 'topk', targetPortId: 'scores', reason: 'Duplicate',
    }]))
    const incompatible = previewAgentGraphPlan({ ...tokenMoePreset, edges: [] }, plan([{
      sourceId: 'router', sourcePortId: 'scores', targetId: 'head', targetPortId: 'hidden', reason: 'Wrong tensor',
    }]))
    const cyclic = previewAgentGraphPlan({ ...tokenMoePreset, edges: [] }, plan([
      { sourceId: 'norm', sourcePortId: 'output', targetId: 'shared', targetPortId: 'hidden', reason: 'Forward edge' },
      { sourceId: 'shared', sourcePortId: 'output', targetId: 'norm', targetPortId: 'hidden', reason: 'Cycle attempt' },
    ]))

    expect(occupied.rejected[0]?.reason).toContain('already connected')
    expect(incompatible.rejected[0]?.reason).toContain('cannot plug')
    expect(cyclic.accepted).toHaveLength(1)
    expect(cyclic.rejected[0]?.reason).toContain('cycle')
  })
})
