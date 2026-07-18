import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./openai-credentials', () => ({
  resolveOpenAIConfig: async () => process.env.OPENAI_API_KEY
    ? { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.6-terra' }
    : undefined,
}))

import { askLabo, validateAskLaboPayload } from './ask-labo'

const previousApiKey = process.env.OPENAI_API_KEY
const previousModel = process.env.OPENAI_MODEL
const functionCall = (name: string, arguments_: Record<string, unknown>, callId: string) => ({ type: 'function_call', name, arguments: JSON.stringify(arguments_), call_id: callId })

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

  it('runs a bounded function-calling loop without exposing the API key', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    process.env.OPENAI_MODEL = 'test-model'
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { model: string; tools: Array<{ name: string; strict: boolean }>; input: unknown[]; parallel_tool_calls: boolean }
      expect(requestBody.model).toBe('test-model')
      expect(requestBody.parallel_tool_calls).toBe(false)
      expect(requestBody.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'search_cards', strict: true }), expect.objectContaining({ name: 'finish_plan', strict: true })]))
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer test-secret-key' })
      if (fetchMock.mock.calls.length === 1) return new Response(JSON.stringify({ output: [functionCall('add_block', { atom_id: 'relu', node_id: 'agent-relu', reason: 'Activation' }, 'call-add')] }), { status: 200 })
      expect(requestBody.input).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call_output', call_id: 'call-add' })]))
      return new Response(JSON.stringify({ output: [functionCall('finish_plan', { summary: 'Build it', missing_blocks: [], warnings: [] }, 'call-finish')] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askLabo({ request: 'Wire my blocks', context: { graph: { nodes: [] }, availableAtomics: [{ atomId: 'relu', label: 'ReLU', inputs: [{ id: 'hidden', tensor: 'hidden' }], outputs: [{ id: 'output', tensor: 'hidden' }] }] } })
    expect(result).toMatchObject({ summary: 'Build it', addedBlocks: [{ atomId: 'relu', nodeId: 'agent-relu', reason: 'Activation' }] })
    expect(result.toolTrace.map((item) => item.tool)).toEqual(['add_block', 'finish_plan'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('requires a main-process API key', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(askLabo({ request: 'Wire my blocks', context: {} })).rejects.toThrow('No OpenAI API key')
  })

  it('keeps existing work read-only in parallel architecture mode', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { instructions: string }
      expect(requestBody.instructions).toContain('Operation mode is parallel architecture')
      expect(requestBody.instructions).toContain('existing node and connection as read-only')
      return new Response(JSON.stringify({ output: [functionCall('finish_plan', { summary: 'Parallel model', missing_blocks: [], warnings: [] }, 'call-finish')] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await askLabo({ request: 'Add another model', context: { operationMode: 'parallel', graph: { nodes: [] } } })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('finds GPT building blocks for a natural-language QA chatbot request', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestBody = JSON.parse(String(init?.body)) as { input: Array<{ type?: string; output?: string }> }
      if (fetchMock.mock.calls.length === 1) return new Response(JSON.stringify({ output: [functionCall('search_cards', { query: 'simple QA chatbot', category: null }, 'call-search')] }), { status: 200 })
      const output = requestBody.input.find((item) => item.type === 'function_call_output')?.output ?? ''
      expect(output).toContain('causal-sdpa')
      expect(output).toContain('lm-head')
      return new Response(JSON.stringify({ output: [functionCall('finish_plan', { summary: 'QA graph found', missing_blocks: [], warnings: [] }, 'call-finish')] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const availableAtomics = ['token-ids-input', 'token-embedding', 'qkv-projection', 'attention-head-layout', 'causal-sdpa', 'merge-attention-heads', 'attention-output-projection', 'rms-norm', 'residual-add', 'swiglu-mlp', 'lm-head', 'greedy-token-decoder'].map((atomId) => ({ atomId, label: atomId, inputs: [], outputs: [] }))

    await expect(askLabo({ request: 'Build a simple QA chatbot', context: { graph: { nodes: [] }, availableAtomics } })).resolves.toMatchObject({ summary: 'QA graph found', missingBlocks: [] })
  })

  it('deletes an architecture through one bulk agent tool', async () => {
    process.env.OPENAI_API_KEY = 'test-secret-key'
    const fetchMock = vi.fn(async () => fetchMock.mock.calls.length === 1
      ? new Response(JSON.stringify({ output: [functionCall('delete_architecture', { architecture_id: 'architecture-1', reason: 'Clean comparison' }, 'call-delete')] }), { status: 200 })
      : new Response(JSON.stringify({ output: [functionCall('finish_plan', { summary: 'Architecture cleaned', missing_blocks: [], warnings: [] }, 'call-finish')] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await askLabo({ request: 'Delete the first architecture', context: { graph: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, architectures: [{ id: 'architecture-1', label: 'First', nodeIds: ['a', 'b'] }] } })
    expect(result.deletedBlocks).toEqual([{ nodeId: 'a', reason: 'Clean comparison (First)' }, { nodeId: 'b', reason: 'Clean comparison (First)' }])
    expect(result.toolTrace).toEqual(expect.arrayContaining([expect.objectContaining({ tool: 'delete_architecture', summary: expect.stringContaining('2 cards') })]))
  })
})
