import { describe, expect, it } from 'vitest'
import { gptLikeStarterPreset } from '../core/presets'
import { architectureDiagramSvg, exportFileName } from './diagram-export'

describe('architecture diagram export', () => {
  it('renders a standalone vector graph with cards and cables', () => {
    const svg = architectureDiagramSvg(gptLikeStarterPreset)

    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain('<path d="M ')
    expect(svg).toContain('Tied token embedding')
    expect(svg).toContain(`${gptLikeStarterPreset.nodes.length} cards`)
    expect(svg).toContain(`${gptLikeStarterPreset.edges.length} links`)
    expect(svg).not.toContain('[object Object]')
  })

  it('creates a filesystem-safe descriptive filename', () => {
    expect(exportFileName({ ...gptLikeStarterPreset, name: 'GPT / Démo 300M' }, 'svg')).toBe('gpt-d-mo-300m.svg')
  })
})
