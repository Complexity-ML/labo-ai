import { describe, expect, it } from 'vitest'
import { findOpenGraphPosition, layoutArchitectureGraph, layoutParallelArchitecture } from './graph-placement'
import { blankStarterPreset, trBasicPreset } from './presets'

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
})
