import { describe, expect, it } from 'vitest'
import { findOpenGraphPosition, layoutArchitectureGraph, layoutParallelArchitecture } from './graph-placement'
import { blankStarterPreset, complexityDeepPreset, gptLikeStarterPreset, tokenMoePreset, trBasicPreset } from './presets'

describe('graph card placement', () => {
  it('starts an empty graph on the placement grid', () => {
    expect(findOpenGraphPosition(blankStarterPreset)).toEqual({ x: 35, y: 55 })
  })

  it('keeps a new card clear of every existing card', () => {
    const position = findOpenGraphPosition(trBasicPreset)
    expect(trBasicPreset.nodes.every((node) => (
      Math.abs(node.position.x - position.x) >= 165
      || Math.abs(node.position.y - position.y) >= 112
    ))).toBe(true)
  })

  it('places parallel branches on the same row and different columns', () => {
    const graph = {
      ...blankStarterPreset,
      nodes: [
        { id: 'input', kind: 'input' as const, label: 'Input', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'left', kind: 'semantic' as const, atomId: 'relu', label: 'Left', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'right', kind: 'semantic' as const, atomId: 'gelu', label: 'Right', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'merge', kind: 'semantic' as const, atomId: 'residual-add', label: 'Merge', role: 'hidden' as const, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'input-left', source: 'input', target: 'left' },
        { id: 'input-right', source: 'input', target: 'right' },
        { id: 'left-merge', source: 'left', target: 'merge' },
        { id: 'right-merge', source: 'right', target: 'merge' },
      ],
    }

    const arranged = layoutArchitectureGraph(graph)
    const input = arranged.nodes.find((node) => node.id === 'input')!
    const left = arranged.nodes.find((node) => node.id === 'left')!
    const right = arranged.nodes.find((node) => node.id === 'right')!
    const merge = arranged.nodes.find((node) => node.id === 'merge')!

    expect(left.position.y).toBe(right.position.y)
    expect(left.position.x).not.toBe(right.position.x)
    expect(input.position.y).toBeLessThan(left.position.y)
    expect(merge.position.y).toBeGreaterThan(left.position.y)
  })

  it('can arrange new nodes without moving existing user work', () => {
    const originalPosition = trBasicPreset.nodes[0]!.position
    const graph = {
      ...trBasicPreset,
      nodes: [...trBasicPreset.nodes, { id: 'agent-relu', kind: 'semantic' as const, atomId: 'relu', label: 'ReLU', role: 'hidden' as const, position: { x: 35, y: 55 } }],
      edges: [...trBasicPreset.edges, { id: 'merge-relu', source: 'merge', target: 'agent-relu' }],
    }

    const arranged = layoutArchitectureGraph(graph, ['agent-relu'])

    expect(arranged.nodes.find((node) => node.id === 'token-ids')?.position).toEqual(originalPosition)
    expect(arranged.nodes.find((node) => node.id === 'agent-relu')?.position.y).toBeGreaterThan(originalPosition.y)
  })

  it('keeps an early skip branch in its own lane until a late merge', () => {
    const graph = {
      ...blankStarterPreset,
      nodes: ['source', 'main-1', 'skip', 'main-2', 'main-3', 'merge'].map((id) => ({
        id,
        kind: 'semantic' as const,
        atomId: id === 'merge' ? 'residual-add' : 'identity',
        label: id,
        role: 'hidden' as const,
        position: { x: 0, y: 0 },
      })),
      edges: [
        { id: 'source-main', source: 'source', target: 'main-1' },
        { id: 'source-skip', source: 'source', target: 'skip' },
        { id: 'main-1-2', source: 'main-1', target: 'main-2' },
        { id: 'main-2-3', source: 'main-2', target: 'main-3' },
        { id: 'main-merge', source: 'main-3', target: 'merge' },
        { id: 'skip-merge', source: 'skip', target: 'merge' },
      ],
    }

    const arranged = layoutArchitectureGraph(graph)
    const main = arranged.nodes.find((node) => node.id === 'main-1')!
    const skip = arranged.nodes.find((node) => node.id === 'skip')!
    const merge = arranged.nodes.find((node) => node.id === 'merge')!
    const deepMain = arranged.nodes.find((node) => node.id === 'main-3')!

    expect(skip.position.y).toBe(main.position.y)
    expect(skip.position.x).not.toBe(main.position.x)
    expect(merge.position.y).toBeGreaterThan(deepMain.position.y)
  })

  it('places a new architecture beside the existing graph without moving user cards', () => {
    const existing = trBasicPreset.nodes.map((node) => ({ ...node, position: { ...node.position } }))
    const graph = {
      ...trBasicPreset,
      nodes: [
        ...existing,
        { id: 'parallel-input', kind: 'input' as const, label: 'Parallel input', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'parallel-left', kind: 'semantic' as const, atomId: 'relu', label: 'Left', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'parallel-right', kind: 'semantic' as const, atomId: 'gelu', label: 'Right', role: 'hidden' as const, position: { x: 0, y: 0 } },
      ],
      edges: [
        ...trBasicPreset.edges,
        { id: 'parallel-input-left', source: 'parallel-input', target: 'parallel-left' },
        { id: 'parallel-input-right', source: 'parallel-input', target: 'parallel-right' },
      ],
    }

    const arranged = layoutParallelArchitecture(graph, ['parallel-input', 'parallel-left', 'parallel-right'])
    const maxExistingX = Math.max(...existing.map((node) => node.position.x))
    expect(arranged.nodes.filter((node) => existing.some((candidate) => candidate.id === node.id)).map((node) => node.position)).toEqual(existing.map((node) => node.position))
    expect(arranged.nodes.find((node) => node.id === 'parallel-input')!.position.x).toBeGreaterThan(maxExistingX)
    expect(arranged.nodes.find((node) => node.id === 'parallel-left')!.position.y).toBe(arranged.nodes.find((node) => node.id === 'parallel-right')!.position.y)
  })

  it('is deterministic and does not inherit anarchic previous coordinates', () => {
    const scrambled = {
      ...trBasicPreset,
      nodes: trBasicPreset.nodes.map((node, index) => ({ ...node, position: { x: 1800 - index * 117, y: (index % 3) * 900 } })),
    }
    const first = layoutArchitectureGraph(scrambled)
    const second = layoutArchitectureGraph(first)

    expect(second.nodes.map((node) => node.position)).toEqual(first.nodes.map((node) => node.position))
  })

  it('keeps a continuing branch in one X lane until its late merge', () => {
    const graph = {
      ...blankStarterPreset,
      nodes: ['source', 'main-1', 'skip', 'main-2', 'main-3', 'merge'].map((id) => ({
        id,
        kind: 'semantic' as const,
        atomId: id === 'merge' ? 'residual-add' : 'identity',
        label: id,
        role: 'hidden' as const,
        position: { x: Math.random() * 1000, y: Math.random() * 1000 },
      })),
      edges: [
        { id: 'source-main', source: 'source', target: 'main-1' },
        { id: 'source-skip', source: 'source', target: 'skip' },
        { id: 'main-1-2', source: 'main-1', target: 'main-2' },
        { id: 'main-2-3', source: 'main-2', target: 'main-3' },
        { id: 'main-merge', source: 'main-3', target: 'merge' },
        { id: 'skip-merge', source: 'skip', target: 'merge' },
      ],
    }
    const arranged = layoutArchitectureGraph(graph)
    const x = (id: string) => arranged.nodes.find((node) => node.id === id)!.position.x

    expect(x('main-2')).toBe(x('main-1'))
    expect(x('main-3')).toBe(x('main-1'))
    expect(x('skip')).not.toBe(x('main-1'))
  })

  it('orders connected branches consistently to avoid cable crossings', () => {
    const graph = {
      ...blankStarterPreset,
      nodes: [
        { id: 'source-left', kind: 'input' as const, label: 'Source left', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'source-right', kind: 'input' as const, label: 'Source right', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'target-right', kind: 'semantic' as const, atomId: 'identity', label: 'Target right', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'target-left', kind: 'semantic' as const, atomId: 'identity', label: 'Target left', role: 'hidden' as const, position: { x: 0, y: 0 } },
        { id: 'merge', kind: 'semantic' as const, atomId: 'residual-add', label: 'Merge', role: 'hidden' as const, position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'left-left', source: 'source-left', target: 'target-left' },
        { id: 'right-right', source: 'source-right', target: 'target-right' },
        { id: 'left-merge', source: 'target-left', target: 'merge' },
        { id: 'right-merge', source: 'target-right', target: 'merge' },
      ],
    }
    const arranged = layoutArchitectureGraph(graph)
    const x = (id: string) => arranged.nodes.find((node) => node.id === id)!.position.x

    expect(Math.sign(x('source-left') - x('source-right'))).toBe(Math.sign(x('target-left') - x('target-right')))
  })

  it('packs disconnected architectures side by side instead of interleaving their ranks', () => {
    const graph = {
      ...blankStarterPreset,
      nodes: ['a-1', 'a-2', 'b-1', 'b-2'].map((id) => ({ id, kind: 'semantic' as const, atomId: 'identity', label: id, role: 'hidden' as const, position: { x: 0, y: 0 } })),
      edges: [
        { id: 'a', source: 'a-1', target: 'a-2' },
        { id: 'b', source: 'b-1', target: 'b-2' },
      ],
    }
    const arranged = layoutArchitectureGraph(graph)
    const node = (id: string) => arranged.nodes.find((candidate) => candidate.id === id)!

    expect(node('a-1').position.y).toBe(node('b-1').position.y)
    expect(node('a-2').position.y).toBe(node('b-2').position.y)
    expect(node('a-1').position.x).toBeLessThan(node('b-1').position.x)
  })

  it('keeps every official preset collision-free with strictly descending execution ranks', () => {
    for (const preset of [gptLikeStarterPreset, trBasicPreset, tokenMoePreset, complexityDeepPreset]) {
      const arranged = layoutArchitectureGraph(preset)
      for (const [index, left] of arranged.nodes.entries()) {
        for (const right of arranged.nodes.slice(index + 1)) {
          expect(Math.abs(left.position.x - right.position.x) >= 170 || Math.abs(left.position.y - right.position.y) >= 110, `${preset.id}: ${left.id} overlaps ${right.id}`).toBe(true)
        }
      }
      for (const edge of arranged.edges) {
        const source = arranged.nodes.find((node) => node.id === edge.source)!
        const target = arranged.nodes.find((node) => node.id === edge.target)!
        expect(target.position.y, `${preset.id}: ${edge.id} must flow downward`).toBeGreaterThan(source.position.y)
      }
    }
  })
})
