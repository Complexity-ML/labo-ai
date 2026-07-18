import { createTokenizerPipeline } from './tokenizer-ir'

export const researchBpePreset = createTokenizerPipeline({
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
