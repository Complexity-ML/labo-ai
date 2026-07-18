export type TokenizerAtomKind =
  | 'unicode-normalize'
  | 'byte-level-pretokenize'
  | 'bpe-model'
  | 'bpe-trainer'
  | 'byte-level-decode'

export type TokenizerLinkKind = 'text' | 'pieces' | 'vocabulary' | 'token-ids'
export type TokenizerTarget = 'python' | 'rust'
export type TokenizerSetting = string | number | boolean | string[]

export interface TokenizerStep {
  id: string
  atom: TokenizerAtomKind
  settings: Record<string, TokenizerSetting>
}

export interface TokenizerLink {
  id: string
  kind: TokenizerLinkKind
  source: string
  target: string
}

export interface TokenizerPipeline {
  id: string
  name: string
  steps: TokenizerStep[]
  links: TokenizerLink[]
}

interface AtomLowering {
  python(step: TokenizerStep): string[]
  rust(step: TokenizerStep): string[]
}

export const tokenizerAtomDefinitions: Record<TokenizerAtomKind, { label: string; category: string; defaultSettings: Record<string, TokenizerSetting> }> = {
  'unicode-normalize': { label: 'Unicode normalization', category: 'Normalization', defaultSettings: { form: 'NFKC' } },
  'byte-level-pretokenize': { label: 'Byte-level pre-tokenizer', category: 'Pre-tokenization', defaultSettings: { addPrefixSpace: false } },
  'bpe-model': { label: 'BPE model', category: 'Model', defaultSettings: { unkToken: '<unk>' } },
  'bpe-trainer': { label: 'BPE trainer', category: 'Training', defaultSettings: { vocabSize: 32768, specialTokens: ['<unk>', '<eos>'] } },
  'byte-level-decode': { label: 'Byte-level decoder', category: 'Decoding', defaultSettings: {} },
}

export const tokenizerAtomMetadata = tokenizerAtomDefinitions

function pythonValue(value: TokenizerSetting): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return JSON.stringify(value)
}

function rustStrings(value: TokenizerSetting): string {
  if (!Array.isArray(value)) return 'vec![]'
  return `vec![${value.map((item) => `${JSON.stringify(item)}.into()`).join(', ')}]`
}

const atomLowerings: Record<TokenizerAtomKind, AtomLowering> = {
  'unicode-normalize': {
    python: (step) => [`tokenizer.normalizer = normalizers.${String(step.settings.form)}()`],
    rust: (step) => [`tokenizer.with_normalizer(unicode_normalizer(${String(step.settings.form)}));`],
  },
  'byte-level-pretokenize': {
    python: (step) => [
      `tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=${pythonValue(step.settings.addPrefixSpace)})`,
    ],
    rust: (step) => [
      `tokenizer.with_pre_tokenizer(ByteLevel::new(${String(step.settings.addPrefixSpace)}, true, true));`,
    ],
  },
  'bpe-model': {
    python: (step) => [`tokenizer = Tokenizer(models.BPE(unk_token=${pythonValue(step.settings.unkToken)}))`],
    rust: (step) => [`let model = BPE::builder().unk_token(${JSON.stringify(step.settings.unkToken)}.into()).build()?;`, 'let mut tokenizer = Tokenizer::new(model);'],
  },
  'bpe-trainer': {
    python: (step) => [
      `trainer = trainers.BpeTrainer(vocab_size=${String(step.settings.vocabSize)}, special_tokens=${pythonValue(step.settings.specialTokens)})`,
    ],
    rust: (step) => [
      `let trainer = BpeTrainer::builder().vocab_size(${String(step.settings.vocabSize)}).special_tokens(${rustStrings(step.settings.specialTokens)}).build();`,
    ],
  },
  'byte-level-decode': {
    python: () => ['tokenizer.decoder = decoders.ByteLevel()'],
    rust: () => ['tokenizer.with_decoder(ByteLevelDecoder::default());'],
  },
}

export function createTokenizerPipeline(input: TokenizerPipeline): TokenizerPipeline {
  return {
    ...input,
    steps: input.steps.map((step) => ({ ...step, settings: { ...step.settings } })),
    links: input.links.map((link) => ({ ...link })),
  }
}

export function addTokenizerStep(pipeline: TokenizerPipeline, atom: TokenizerAtomKind): TokenizerPipeline {
  const definition = tokenizerAtomDefinitions[atom]
  const usedNumbers = pipeline.steps
    .filter((step) => step.id.startsWith(`${atom}-`))
    .map((step) => Number(step.id.slice(atom.length + 1)))
    .filter(Number.isFinite)
  const sequence = Math.max(0, ...usedNumbers) + 1
  const settings = Object.fromEntries(Object.entries(definition.defaultSettings).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]))
  return {
    ...pipeline,
    steps: [...pipeline.steps.map((step) => ({ ...step, settings: { ...step.settings } })), { id: `${atom}-${sequence}`, atom, settings }],
    links: pipeline.links.map((link) => ({ ...link })),
  }
}

export function updateTokenizerStepSettings(
  pipeline: TokenizerPipeline,
  stepId: string,
  settings: Record<string, TokenizerSetting>,
): TokenizerPipeline {
  if (!pipeline.steps.some((step) => step.id === stepId)) throw new Error(`Unknown tokenizer step: ${stepId}`)
  return {
    ...pipeline,
    steps: pipeline.steps.map((step) => step.id === stepId
      ? { ...step, settings: { ...step.settings, ...settings } }
      : { ...step, settings: { ...step.settings } }),
    links: pipeline.links.map((link) => ({ ...link })),
  }
}

export function removeTokenizerStep(pipeline: TokenizerPipeline, stepId: string): TokenizerPipeline {
  if (!pipeline.steps.some((step) => step.id === stepId)) throw new Error(`Unknown tokenizer step: ${stepId}`)
  return {
    ...pipeline,
    steps: pipeline.steps.filter((step) => step.id !== stepId).map((step) => ({ ...step, settings: { ...step.settings } })),
    links: pipeline.links
      .filter((link) => link.source !== stepId && link.target !== stepId)
      .map((link) => ({ ...link })),
  }
}

export function validateTokenizerPipeline(pipeline: TokenizerPipeline) {
  const errors: string[] = []
  const ids = new Set<string>()
  for (const step of pipeline.steps) {
    if (ids.has(step.id)) errors.push(`Duplicate tokenizer step: ${step.id}`)
    ids.add(step.id)
  }
  for (const link of pipeline.links) {
    if (!ids.has(link.source)) errors.push(`Unknown tokenizer link source: ${link.source}`)
    if (!ids.has(link.target)) errors.push(`Unknown tokenizer link target: ${link.target}`)
  }
  return { valid: errors.length === 0, errors }
}

export function compileTokenizer(pipeline: TokenizerPipeline, target: TokenizerTarget): string {
  const validation = validateTokenizerPipeline(pipeline)
  if (!validation.valid) throw new Error(validation.errors.join('\n'))

  const body = pipeline.steps.flatMap((step) => atomLowerings[step.atom][target](step))
  if (target === 'python') {
    return [
      'from tokenizers import Tokenizer, decoders, models, normalizers, pre_tokenizers, trainers',
      '',
      ...body,
      '',
      '# Provide corpus paths from the experiment manifest.',
      'tokenizer.train(files=corpus_files, trainer=trainer)',
      'tokenizer.save(output_path)',
      '',
    ].join('\n')
  }

  return [
    'use tokenizers::Tokenizer;',
    'use tokenizers::models::bpe::{BPE, BpeTrainer};',
    '',
    'fn build_tokenizer() -> anyhow::Result<Tokenizer> {',
    ...body.map((line) => `    ${line}`),
    '    Ok(tokenizer)',
    '}',
    '',
  ].join('\n')
}
