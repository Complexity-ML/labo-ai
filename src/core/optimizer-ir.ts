export type OptimizerValue = number | boolean | string | null | Array<number | null>

export interface OptimizerDefinition {
  id: string
  label: string
  torchClass: string
  defaults: Record<string, OptimizerValue>
  notes?: string
}

export interface OptimizerConfig {
  id: string
  kind: string
  settings: Record<string, OptimizerValue>
}

export const optimizerRegistry: Record<string, OptimizerDefinition> = {
  adamw: { id: 'adamw', label: 'AdamW', torchClass: 'AdamW', defaults: { lr: 0.001, betas: [0.9, 0.999], eps: 1e-8, weight_decay: 0.01, amsgrad: false, fused: false } },
  adam: { id: 'adam', label: 'Adam', torchClass: 'Adam', defaults: { lr: 0.001, betas: [0.9, 0.999], eps: 1e-8, weight_decay: 0, amsgrad: false, fused: false } },
  muon: { id: 'muon', label: 'Muon', torchClass: 'Muon', defaults: { lr: 0.001, weight_decay: 0.1, momentum: 0.95, nesterov: true, ns_coefficients: [3.4445, -4.775, 2.0315], eps: 1e-7, ns_steps: 5, adjust_lr_fn: null }, notes: 'PyTorch 2.13 Muon with Newton–Schulz orthogonalization controls.' },
  sgd: { id: 'sgd', label: 'SGD', torchClass: 'SGD', defaults: { lr: 0.001, momentum: 0, dampening: 0, weight_decay: 0, nesterov: false, fused: false } },
  adafactor: { id: 'adafactor', label: 'Adafactor', torchClass: 'Adafactor', defaults: { lr: 0.01, beta2_decay: -0.8, eps: [null, 0.001], d: 1, weight_decay: 0 } },
  rmsprop: { id: 'rmsprop', label: 'RMSprop', torchClass: 'RMSprop', defaults: { lr: 0.01, alpha: 0.99, eps: 1e-8, weight_decay: 0, momentum: 0, centered: false } },
  nadam: { id: 'nadam', label: 'NAdam', torchClass: 'NAdam', defaults: { lr: 0.002, betas: [0.9, 0.999], eps: 1e-8, weight_decay: 0, momentum_decay: 0.004, decoupled_weight_decay: false } },
  radam: { id: 'radam', label: 'RAdam', torchClass: 'RAdam', defaults: { lr: 0.001, betas: [0.9, 0.999], eps: 1e-8, weight_decay: 0, decoupled_weight_decay: false } },
  'sparse-adam': { id: 'sparse-adam', label: 'SparseAdam', torchClass: 'SparseAdam', defaults: { lr: 0.001, betas: [0.9, 0.999], eps: 1e-8 } },
  adagrad: { id: 'adagrad', label: 'Adagrad', torchClass: 'Adagrad', defaults: { lr: 0.01, lr_decay: 0, weight_decay: 0, initial_accumulator_value: 0, eps: 1e-10 } },
  adadelta: { id: 'adadelta', label: 'Adadelta', torchClass: 'Adadelta', defaults: { lr: 1, rho: 0.9, eps: 1e-6, weight_decay: 0 } },
  asgd: { id: 'asgd', label: 'ASGD', torchClass: 'ASGD', defaults: { lr: 0.01, lambd: 0.0001, alpha: 0.75, t0: 1000000, weight_decay: 0 } },
  lbfgs: { id: 'lbfgs', label: 'LBFGS', torchClass: 'LBFGS', defaults: { lr: 1, max_iter: 20, max_eval: 25, tolerance_grad: 1e-7, tolerance_change: 1e-9, history_size: 100, line_search_fn: null } },
}

function cloneValue(value: OptimizerValue): OptimizerValue {
  return Array.isArray(value) ? [...value] : value
}

export function createOptimizerConfig(kind: string, overrides: Record<string, OptimizerValue> = {}): OptimizerConfig {
  const definition = optimizerRegistry[kind]
  if (!definition) throw new Error(`Unknown optimizer: ${kind}`)
  for (const key of Object.keys(overrides)) {
    if (!(key in definition.defaults)) throw new Error(`Unknown ${kind} setting: ${key}`)
  }
  return {
    id: `${kind}-1`,
    kind,
    settings: Object.fromEntries(Object.entries({ ...definition.defaults, ...overrides }).map(([key, value]) => [key, cloneValue(value)])),
  }
}

function pythonValue(value: OptimizerValue): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `(${value.map(pythonValue).join(', ')})`
  return String(value)
}

export function compileOptimizer(config: OptimizerConfig, parameters = 'model.parameters()'): string {
  const definition = optimizerRegistry[config.kind]
  if (!definition) throw new Error(`Unknown optimizer: ${config.kind}`)
  const settings = Object.entries(config.settings).map(([key, value]) => `${key}=${pythonValue(value)}`).join(', ')
  return `optimizer = torch.optim.${definition.torchClass}(${parameters}, ${settings})`
}
