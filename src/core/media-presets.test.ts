import { describe, expect, it } from 'vitest'
import { compileToPyTorch, validateGraph } from './ir'
import { multimodalImageEditorPreset, videoTransformerPreset, visionTransformerPreset } from './media-presets'
import { modelAtomRegistry } from './model-atoms'

const mediaPresets = [visionTransformerPreset, multimodalImageEditorPreset, videoTransformerPreset]

describe('executable media presets', () => {
  it.each(mediaPresets.map((preset) => [preset.name, preset] as const))('%s validates and compiles to PyTorch', (_name, preset) => {
    expect(validateGraph(preset)).toEqual({ valid: true, errors: [] })
    const code = compileToPyTorch(preset)
    expect(code).toContain('class GeneratedModel(nn.Module):')
    expect(code).toContain('# labo:node=')
  })

  it('uses explicit image, video and multimodal atomic capabilities', () => {
    for (const atomId of ['vision-patch-projection', 'modality-type-embedding', 'adaptive-conditioning', 'temporal-depthwise-convolution', 'latent-denoiser', 'image-latent-decoder', 'video-latent-decoder']) {
      expect(modelAtomRegistry[atomId]).toMatchObject({ id: atomId, category: 'media', lowerings: { pytorch: { executable: true } } })
    }
  })
})
