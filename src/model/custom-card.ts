import type { TensorRole } from '../core/ir'

export interface CustomPyTorchCard {
  id: string
  label: string
  code: string
  inputRole?: TensorRole
  outputRole?: TensorRole
}

export type CustomCardOperation = 'linear' | 'rmsnorm' | 'layernorm' | 'dropout' | 'gelu' | 'silu' | 'relu' | 'identity'
export type CustomCardCategory = 'projection' | 'normalization' | 'activation' | 'regularization' | 'utility'

export const customCardOperations: Array<{ id: CustomCardOperation; label: string }> = [
  { id: 'linear', label: 'Linear' },
  { id: 'rmsnorm', label: 'RMSNorm' },
  { id: 'layernorm', label: 'LayerNorm' },
  { id: 'dropout', label: 'Dropout' },
  { id: 'gelu', label: 'GELU' },
  { id: 'silu', label: 'SiLU' },
  { id: 'relu', label: 'ReLU' },
  { id: 'identity', label: 'Identity' },
]

export function customCardModule(operation: CustomCardOperation, inFeatures: number, outFeatures: number, probability: number): string {
  if (operation === 'linear') return `nn.Linear(${inFeatures}, ${outFeatures})`
  if (operation === 'rmsnorm') return `nn.RMSNorm(${outFeatures})`
  if (operation === 'layernorm') return `nn.LayerNorm(${outFeatures})`
  if (operation === 'dropout') return `nn.Dropout(${probability})`
  if (operation === 'gelu') return 'nn.GELU()'
  if (operation === 'silu') return 'nn.SiLU()'
  if (operation === 'relu') return 'nn.ReLU()'
  return 'nn.Identity()'
}

export function suggestedCardOperation(category: CustomCardCategory, need: string): CustomCardOperation {
  const normalized = need.toLowerCase()
  if (category === 'normalization') return normalized.includes('layer') ? 'layernorm' : 'rmsnorm'
  if (category === 'activation') {
    if (normalized.includes('silu') || normalized.includes('swiglu')) return 'silu'
    if (normalized.includes('relu')) return 'relu'
    return 'gelu'
  }
  if (category === 'regularization') return 'dropout'
  if (category === 'utility') return 'identity'
  return 'linear'
}
