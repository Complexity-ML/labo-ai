import { describe, expect, it } from 'vitest'
import { addTokenizerStep, compileTokenizer, createTokenizerPipeline, removeTokenizerStep, tokenizerAtomDefinitions, updateTokenizerStepSettings, validateTokenizerPipeline } from './tokenizer-ir'

const pipeline = createTokenizerPipeline({
  id: 'research-bpe',
  name: 'Research BPE',
  steps: [
    { id: 'normalize', atom: 'unicode-normalize', settings: { form: 'NFKC' } },
    { id: 'pretokenize', atom: 'byte-level-pretokenize', settings: { addPrefixSpace: false } },
    { id: 'model', atom: 'bpe-model', settings: { unkToken: '<unk>' } },
    { id: 'train', atom: 'bpe-trainer', settings: { vocabSize: 32768, specialTokens: ['<unk>', '<eos>'] } },
    { id: 'decode', atom: 'byte-level-decode', settings: {} },
  ],
  links: [
    { id: 'text-normalized', kind: 'text', source: 'normalize', target: 'pretokenize' },
    { id: 'pieces-model', kind: 'pieces', source: 'pretokenize', target: 'model' },
    { id: 'model-training', kind: 'vocabulary', source: 'model', target: 'train' },
    { id: 'model-decoder', kind: 'token-ids', source: 'model', target: 'decode' },
  ],
})

describe('atomic Tokenizer IR', () => {
  it('compiles one block composition to Python and Rust targets', () => {
    expect(validateTokenizerPipeline(pipeline)).toEqual({ valid: true, errors: [] })

    const python = compileTokenizer(pipeline, 'python')
    const rust = compileTokenizer(pipeline, 'rust')

    expect(python).toContain('normalizers.NFKC()')
    expect(python).toContain('pre_tokenizers.ByteLevel(add_prefix_space=False)')
    expect(python).toContain('vocab_size=32768')
    expect(rust).toContain('unicode_normalizer(NFKC)')
    expect(rust).toContain('vocab_size(32768)')
  })

  it('recompiles both backends from tokenizer mutations', () => {
    const resized = updateTokenizerStepSettings(pipeline, 'train', { vocabSize: 4096 })
    const withoutNormalization = removeTokenizerStep(resized, 'normalize')
    const python = compileTokenizer(withoutNormalization, 'python')
    const rust = compileTokenizer(withoutNormalization, 'rust')

    expect(python).toContain('vocab_size=4096')
    expect(rust).toContain('vocab_size(4096)')
    expect(python).not.toContain('tokenizer.normalizer')
    expect(rust).not.toContain('with_normalizer')
    expect(withoutNormalization.links.every((link) => link.source !== 'normalize' && link.target !== 'normalize')).toBe(true)
    expect(pipeline.steps.find((step) => step.id === 'train')?.settings.vocabSize).toBe(32768)
  })

  it('rebuilds an empty pipeline from a permanent atom library', () => {
    let empty = pipeline
    for (const step of pipeline.steps) empty = removeTokenizerStep(empty, step.id)

    expect(empty.steps).toEqual([])
    expect(Object.keys(tokenizerAtomDefinitions)).toHaveLength(5)
    const rebuilt = addTokenizerStep(empty, 'bpe-model')
    expect(rebuilt.steps).toEqual([
      { id: 'bpe-model-1', atom: 'bpe-model', settings: { unkToken: '<unk>' } },
    ])
    expect(empty.steps).toEqual([])
  })
})
