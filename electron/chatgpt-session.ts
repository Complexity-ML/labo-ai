import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import type { AskLaboPayload, AskLaboPlan } from './ask-labo.js'
import { validateAskLaboPayload } from './ask-labo.js'

export interface ChatGPTSessionStatus {
  available: boolean
  connected: boolean
  email?: string
  planType?: string
  error?: string
}

type JsonRecord = Record<string, unknown>
type OpenExternal = (url: string) => Promise<unknown>

const require = createRequire(import.meta.url)
const requestTimeoutMs = 30_000
const loginTimeoutMs = 5 * 60_000
const turnTimeoutMs = 3 * 60_000

const string = { type: 'string' }
const nullableString = { anyOf: [string, { type: 'null' }] }
const reason = { type: 'string' }
const planSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: string,
    addedBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { atomId: string, nodeId: string, reason }, required: ['atomId', 'nodeId', 'reason'] } },
    createdBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nodeId: string, label: string, pytorchModule: string, inputRole: string, outputRole: string, reason }, required: ['nodeId', 'label', 'pytorchModule', 'inputRole', 'outputRole', 'reason'] } },
    connections: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { sourceId: string, sourcePortId: string, targetId: string, targetPortId: string, reason }, required: ['sourceId', 'sourcePortId', 'targetId', 'targetPortId', 'reason'] } },
    updatedBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nodeId: string, label: nullableString, settings: { anyOf: [{ type: 'object', additionalProperties: false, properties: {} }, { type: 'null' }] }, pytorchModule: nullableString, reason }, required: ['nodeId', 'label', 'settings', 'pytorchModule', 'reason'] } },
    deletedBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nodeId: string, reason }, required: ['nodeId', 'reason'] } },
    movedBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { nodeId: string, x: { type: 'number' }, y: { type: 'number' }, reason }, required: ['nodeId', 'x', 'y', 'reason'] } },
    actions: { type: 'array', items: { anyOf: [
      { type: 'object', additionalProperties: false, properties: { type: { const: 'layout' }, scope: { type: 'string', enum: ['all', 'new'] }, reason }, required: ['type', 'scope', 'reason'] },
      { type: 'object', additionalProperties: false, properties: { type: { const: 'run' }, mode: { type: 'string', enum: ['play', 'step'] }, reason }, required: ['type', 'mode', 'reason'] },
      { type: 'object', additionalProperties: false, properties: { type: { const: 'save-preset' }, name: string, reason }, required: ['type', 'name', 'reason'] },
      { type: 'object', additionalProperties: false, properties: { type: { const: 'export' }, kind: { type: 'string', enum: ['svg', 'python', 'both'] }, reason }, required: ['type', 'kind', 'reason'] },
    ] } },
    missingBlocks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { atomId: nullableString, label: string, reason }, required: ['atomId', 'label', 'reason'] } },
    warnings: { type: 'array', items: string },
    toolTrace: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { tool: string, status: { type: 'string', enum: ['accepted', 'rejected', 'read'] }, summary: string }, required: ['tool', 'status', 'summary'] } },
  },
  required: ['summary', 'addedBlocks', 'createdBlocks', 'connections', 'updatedBlocks', 'deletedBlocks', 'movedBlocks', 'actions', 'missingBlocks', 'warnings', 'toolTrace'],
} as const

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function codexCommand(): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const configured = process.env.LABO_CODEX_PATH?.trim()
  if (configured) return { command: configured, args: ['app-server'] }
  const target = ({
    'darwin-arm64': ['@openai/codex-darwin-arm64', 'aarch64-apple-darwin'],
    'darwin-x64': ['@openai/codex-darwin-x64', 'x86_64-apple-darwin'],
    'linux-arm64': ['@openai/codex-linux-arm64', 'aarch64-unknown-linux-musl'],
    'linux-x64': ['@openai/codex-linux-x64', 'x86_64-unknown-linux-musl'],
    'win32-arm64': ['@openai/codex-win32-arm64', 'aarch64-pc-windows-msvc'],
    'win32-x64': ['@openai/codex-win32-x64', 'x86_64-pc-windows-msvc'],
  } as Record<string, [string, string]>)[`${process.platform}-${process.arch}`]
  if (target) {
    try {
      const packageJson = require.resolve(`${target[0]}/package.json`)
      const packageRoot = dirname(packageJson).replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
      const executable = join(packageRoot, 'vendor', target[1], 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
      if (existsSync(executable)) return { command: executable, args: ['app-server'] }
    } catch { /* fall through to the portable JS launcher */ }
  }
  try {
    const script = require.resolve('@openai/codex/bin/codex.js')
    return { command: process.execPath, args: [script, 'app-server'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  } catch {
    return { command: 'codex', args: ['app-server'] }
  }
}

function errorMessage(value: unknown): string {
  const record = asRecord(value)
  return typeof record.message === 'string' ? record.message : String(value)
}

export class CodexAppServer {
  private process?: ChildProcessWithoutNullStreams
  private nextId = 1
  private initialized?: Promise<void>
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(reason: Error): void; timeout: NodeJS.Timeout }>()
  private readonly notificationListeners = new Set<(method: string, params: unknown) => void>()

  constructor(private readonly openExternal: OpenExternal, private readonly version = '0.0.0') {}

  private start(): Promise<void> {
    if (this.initialized) return this.initialized
    this.initialized = new Promise<void>((resolve, reject) => {
      const invocation = codexCommand()
      let settled = false
      try {
        this.process = spawn(invocation.command, invocation.args, { env: invocation.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] })
      } catch (error) {
        reject(error)
        return
      }
      this.process.once('error', (error) => {
        if (!settled) reject(error)
        this.failAll(error)
      })
      this.process.stderr.resume()
      this.process.once('exit', (code, signal) => {
        this.failAll(new Error(`Codex App Server stopped${code !== null ? ` (${code})` : signal ? ` (${signal})` : ''}`))
        this.process = undefined
        this.initialized = undefined
      })
      const lines = createInterface({ input: this.process.stdout })
      lines.on('line', (line) => this.receive(line))
      void this.request('initialize', { clientInfo: { name: 'labo_ai', title: 'LABO AI', version: this.version }, capabilities: null })
        .then(() => {
          this.write({ method: 'initialized' })
          settled = true
          resolve()
        })
        .catch((error) => {
          this.process?.kill()
          this.initialized = undefined
          reject(error)
        })
    })
    return this.initialized
  }

  private write(message: JsonRecord): void {
    if (!this.process?.stdin.writable) throw new Error('Codex App Server is not available')
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private receive(line: string): void {
    let message: JsonRecord
    try { message = asRecord(JSON.parse(line)) } catch { return }
    if (typeof message.id === 'number' && ('result' in message || 'error' in message)) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timeout)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(errorMessage(message.error)))
      else pending.resolve(message.result)
      return
    }
    if (typeof message.method === 'string' && 'id' in message) {
      this.write({ id: message.id, error: { code: -32601, message: 'LABO AI does not allow App Server tool requests' } })
      return
    }
    if (typeof message.method === 'string') {
      for (const listener of this.notificationListeners) listener(message.method, message.params)
    }
  }

  private request(method: string, params?: unknown, timeoutMs = requestTimeoutMs): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      try { this.write({ id, method, params }) } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  private failAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private waitFor(method: string, predicate: (params: JsonRecord) => boolean, timeoutMs: number): Promise<JsonRecord> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.notificationListeners.delete(listener)
        reject(new Error(`${method} timed out`))
      }, timeoutMs)
      const listener = (candidate: string, params: unknown) => {
        const value = asRecord(params)
        if (candidate !== method || !predicate(value)) return
        clearTimeout(timeout)
        this.notificationListeners.delete(listener)
        resolve(value)
      }
      this.notificationListeners.add(listener)
    })
  }

  async status(): Promise<ChatGPTSessionStatus> {
    try {
      await this.start()
      const response = asRecord(await this.request('account/read', { refreshToken: false }))
      const account = asRecord(response.account)
      return account.type === 'chatgpt'
        ? { available: true, connected: true, email: typeof account.email === 'string' ? account.email : undefined, planType: typeof account.planType === 'string' ? account.planType : undefined }
        : { available: true, connected: false }
    } catch (error) {
      return { available: false, connected: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async connect(): Promise<ChatGPTSessionStatus> {
    await this.start()
    const result = asRecord(await this.request('account/login/start', { type: 'chatgpt', useHostedLoginSuccessPage: true, appBrand: 'chatgpt' }))
    if (result.type !== 'chatgpt' || typeof result.loginId !== 'string' || typeof result.authUrl !== 'string') throw new Error('Codex did not return a ChatGPT sign-in URL')
    const completed = this.waitFor('account/login/completed', (params) => params.loginId === result.loginId, loginTimeoutMs)
    await this.openExternal(result.authUrl)
    const notification = await completed
    if (notification.success !== true) throw new Error(typeof notification.error === 'string' ? notification.error : 'ChatGPT sign-in was not completed')
    return this.status()
  }

  async disconnect(): Promise<ChatGPTSessionStatus> {
    await this.start()
    await this.request('account/logout')
    return { available: true, connected: false }
  }

  async ask(payload: AskLaboPayload): Promise<AskLaboPlan> {
    validateAskLaboPayload(payload)
    const status = await this.status()
    if (!status.connected) throw new Error('Connect your ChatGPT account from Settings → Agent first')
    const threadResponse = asRecord(await this.request('thread/start', {
      cwd: tmpdir(), approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
      baseInstructions: 'You are LABO AI, a bounded neural graph planner. Never run commands, inspect files, browse, or mutate the computer. Return only the requested structured graph plan.',
      developerInstructions: 'Use only atom IDs and exact port IDs present in the supplied context. Prefer existing cards, keep IDs alphanumeric with hyphens, preserve current work unless asked, and include a layout action after graph mutations. If a capability is absent, report it in missingBlocks instead of inventing an atom.',
    }))
    const thread = asRecord(threadResponse.thread)
    if (typeof thread.id !== 'string') throw new Error('Codex did not start a LABO planning thread')
    const completed = this.waitFor('turn/completed', (params) => params.threadId === thread.id, turnTimeoutMs)
    await this.request('turn/start', {
      threadId: thread.id,
      input: [{ type: 'text', text: JSON.stringify({ request: payload.request.trim(), context: payload.context }), text_elements: [] }],
      approvalPolicy: 'never', outputSchema: planSchema,
    }, turnTimeoutMs)
    const notification = await completed
    const turn = asRecord(notification.turn)
    if (turn.status !== 'completed') throw new Error(errorMessage(turn.error ?? 'ChatGPT planning failed'))
    const items = Array.isArray(turn.items) ? turn.items.map(asRecord) : []
    const text = items.filter((item) => item.type === 'agentMessage' && typeof item.text === 'string').map((item) => item.text as string).at(-1)
    if (!text) throw new Error('ChatGPT returned no LABO graph plan')
    let plan: AskLaboPlan
    try { plan = JSON.parse(text) as AskLaboPlan } catch { throw new Error('ChatGPT returned an unreadable LABO graph plan') }
    if (!plan || typeof plan.summary !== 'string' || !Array.isArray(plan.addedBlocks) || !Array.isArray(plan.connections)) throw new Error('ChatGPT returned an invalid LABO graph plan')
    void this.request('thread/delete', { threadId: thread.id }).catch(() => undefined)
    return plan
  }

  stop(): void {
    this.process?.kill()
    this.process = undefined
    this.initialized = undefined
  }
}
