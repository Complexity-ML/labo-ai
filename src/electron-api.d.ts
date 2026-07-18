interface LaboRuntimeResult {
  atomId: string
  status: 'passed' | 'failed'
  summary?: string
  error?: string
}

interface LaboRuntimeTrace {
  engine: 'pytorch' | 'tokenizers'
  status: 'completed' | 'failed'
  currentAtomId?: string
  error?: string
  tokenIds?: number[]
  modelOutput?: {
    kind: 'logits' | 'tensor'
    tensorShape: number[]
    logitsShape?: number[]
    predictedTokenId?: number
    topTokenIds?: number[]
    topProbabilities?: number[]
  }
  results: LaboRuntimeResult[]
}

interface Window {
  labo?: {
    platform: string
    runtime: 'electron' | 'web'
    runAtomic?(payload: { kind: 'model'; graph: unknown; tokenIds?: number[] } | { kind: 'tokenizer'; pipeline: unknown; sample?: string }): Promise<LaboRuntimeTrace>
    askLabo?(payload: { request: string; context: Record<string, unknown> }): Promise<import('./core/agentic-graph').AgentGraphPlan>
    getOpenAISettings?(): Promise<OpenAISettingsStatus>
    saveOpenAIKey?(apiKey: string): Promise<OpenAISettingsStatus>
    deleteOpenAIKey?(): Promise<OpenAISettingsStatus>
    testOpenAIKey?(): Promise<{ ok: true }>
    loadWebWorkspace?(): Promise<{ authenticated: boolean; workspace: unknown; customCards: unknown[]; updatedAt?: number; warning?: string }>
    saveWebWorkspace?(payload: { workspace: unknown; customCards: unknown[] }): Promise<{ saved: true; updatedAt: number }>
    exportFile?(payload: { filename: string; content: string; kind: 'svg' | 'python' }): Promise<{ saved: boolean; path?: string }>
    getWindowState?(): Promise<{ fullScreen: boolean }>
    onWindowStateChange?(callback: (state: { fullScreen: boolean }) => void): () => void
  }
}

interface OpenAISettingsStatus {
  configured: boolean
  source: 'environment' | 'secure-storage' | 'none'
  encryptionAvailable: boolean
  authRequired?: boolean
  prefix?: string
}
