import { describe, expect, it } from 'vitest'
import { findOpenGraphPosition } from './graph-placement'
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
})
