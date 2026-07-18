import { describe, expect, it } from 'vitest'
import { executionLayers } from './execution-plan'
import { complexityDeepPreset } from './presets'

describe('elastic execution plan', () => {
  it('groups independent branches into stable parallel levels', () => {
    expect(executionLayers(complexityDeepPreset)).toEqual([
      ['tokens'],
      ['embedding', 'fixed-routes'],
      ['attention-norm'],
      ['qkv'],
      ['head-layout'],
      ['qk-norm'],
      ['rope'],
      ['kv-expand'],
      ['sdpa'],
      ['merge-heads'],
      ['attention-output'],
      ['attention-residual'],
      ['mlp-norm'],
      ['shared', 'routed'],
      ['branch-gates'],
      ['block-residual'],
      ['final-norm'],
      ['head'],
    ])
  })
})
