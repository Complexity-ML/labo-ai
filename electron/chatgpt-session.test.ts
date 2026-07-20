import { describe, expect, it } from 'vitest'
import { chatGPTPlanSchema } from './chatgpt-session'

describe('ChatGPT structured graph plan schema', () => {
  it('declares a JSON type for every constant discriminator', () => {
    const missingTypes: string[] = []
    const visit = (value: unknown, path = '$') => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        value.forEach((item, index) => visit(item, `${path}[${index}]`))
        return
      }
      const record = value as Record<string, unknown>
      if ('const' in record && typeof record.type !== 'string') missingTypes.push(path)
      for (const [key, child] of Object.entries(record)) visit(child, `${path}.${key}`)
    }

    visit(chatGPTPlanSchema)
    expect(missingTypes).toEqual([])
  })
})
