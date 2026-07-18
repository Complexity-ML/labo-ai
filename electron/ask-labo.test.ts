import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./openai-credentials', () => ({
  resolveOpenAIConfig: async () => process.env.OPENAI_API_KEY
    ? { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.6-terra' }
    : undefined,
}))

import { askLabo, validateAskLaboPayload } from './ask-labo'

const previousApiKey = process.env.OPENAI_API_KEY
const previousModel = process.env.OPENAI_MODEL

afterEach(() => {
  vi.unstubAllGlobals()
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY
  else process.env.OPENAI_API_KEY = previousApiKey
  if (previousModel === undefined) delete process.env.OPENAI_MODEL
  else process.env.OPENAI_MODEL = previousModel
})

describe('Ask LABO OpenAI bridge', () => {
  it('rejects empty and malformed renderer payloads', () => {
    expect(() => validateAskLaboPayload({ request: '', context: {} })).toThrow('cannot be empty')
    expect(() => validateAskLaboPayload(null as never)).toThrow('requires a request')
  })

  it('requests a strict graph plan without exposing the API key to the renderer', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    process.env.OPENAI_MODEL = 'test-model'
    const responsePlan = { summary: 'Build it', addedBlocks: [{ atomId: 'relu', nodeId: 'agent-relu', reason: 'Needed activation' }], createdBlocks: [], connections: [], missingBlocks: [], warnings: [] }
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { model: string; text: { format: { type: string; strict: boolean; schema: { required: string[] } } } }
      expect(requestBody.model).toBe('test-model')
      expect(requestBody.text.format).toMatchObject({ type: 'json_schema', strict: true })
      expect(requestBody.text.format.schema.required).toContain('addedBlocks')
      expect(requestBody.text.format.schema.required).toContain('createdBlocks')
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-secret-key' })
      return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(responsePlan) }] }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(askLabo({ request: 'Wire my blocks', context: { graph: { nodes: [] } } })).resolves.toEqual(responsePlan)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('requires a main-process API key', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(askLabo({ request: 'Wire my blocks', context: {} })).rejects.toThrow('No OpenAI API key')
  })

  it('tells the model to preserve existing work in parallel architecture mode', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    const responsePlan = { summary: 'Parallel model', addedBlocks: [], createdBlocks: [], connections: [], missingBlocks: [], warnings: [] }
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { instructions: string }
      expect(requestBody.instructions).toContain('Operation mode is parallel architecture')
      expect(requestBody.instructions).toContain('existing node and connection as read-only')
      return new Response(JSON.stringify({ output_text: JSON.stringify(responsePlan) }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await askLabo({ request: 'Add another model', context: { operationMode: 'parallel', graph: { nodes: [] } } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
