import type { ArchitectureGraph } from './ir'

export const MODEL_WORKSPACE_STORAGE_KEY = 'labo.model-workspace.v1'
export const MODEL_DATABASE_NAME = 'labo-ai'

const MODEL_DATABASE_VERSION = 1
const workspaceStoreName = 'model-workspaces'
const presetStoreName = 'model-presets'

export interface ModelPresetDraft {
  graph: ArchitectureGraph
  selectedNodeId: string
}

export interface ModelWorkspaceState {
  activePresetId: string
  drafts: Record<string, ModelPresetDraft>
  userPresets: ArchitectureGraph[]
  updatedAt: number
}

export const emptyModelWorkspace = (): ModelWorkspaceState => ({
  activePresetId: '',
  drafts: {},
  userPresets: [],
  updatedAt: 0,
})

interface StoredPresetRecord {
  id: string
  source: 'default' | 'user'
  graph: ArchitectureGraph
  updatedAt: number
}

function isGraph(value: unknown): value is ArchitectureGraph {
  if (!value || typeof value !== 'object') return false
  const graph = value as Partial<ArchitectureGraph>
  return typeof graph.id === 'string'
    && typeof graph.name === 'string'
    && (graph.architecture === 'gqa' || graph.architecture === 'custom')
    && Array.isArray(graph.nodes)
    && graph.nodes.every((node) => (
      typeof node?.id === 'string'
      && typeof node?.label === 'string'
      && typeof node?.position?.x === 'number'
      && Number.isFinite(node.position.x)
      && typeof node?.position?.y === 'number'
      && Number.isFinite(node.position.y)
    ))
    && Array.isArray(graph.edges)
    && graph.edges.every((edge) => typeof edge?.id === 'string' && typeof edge?.source === 'string' && typeof edge?.target === 'string')
    && typeof graph.config === 'object'
    && typeof graph.contracts === 'object'
}

function isDraft(value: unknown): value is ModelPresetDraft {
  if (!value || typeof value !== 'object') return false
  const draft = value as Partial<ModelPresetDraft>
  return isGraph(draft.graph) && typeof draft.selectedNodeId === 'string'
}

function sameGraphContent(left: ArchitectureGraph, right: ArchitectureGraph): boolean {
  const content = ({ architecture, nodes, edges, groups, config, contracts }: ArchitectureGraph) => ({ architecture, nodes, edges, groups, config, contracts })
  return JSON.stringify(content(left)) === JSON.stringify(content(right))
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function parseModelWorkspace(value: unknown): ModelWorkspaceState {
  if (!value || typeof value !== 'object') return emptyModelWorkspace()
  const candidate = value as Partial<ModelWorkspaceState>
  const drafts = Object.fromEntries(Object.entries(candidate.drafts ?? {}).filter((entry): entry is [string, ModelPresetDraft] => isDraft(entry[1])))
  const userPresets = Array.isArray(candidate.userPresets) ? candidate.userPresets.filter(isGraph) : []
  const blankDraft = drafts['blank-starter']
  if (blankDraft && userPresets.some((preset) => sameGraphContent(blankDraft.graph, preset))) delete drafts['blank-starter']
  return {
    activePresetId: typeof candidate.activePresetId === 'string' ? candidate.activePresetId : '',
    drafts,
    userPresets,
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0,
  }
}

function openModelDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const request = indexedDB.open(MODEL_DATABASE_NAME, MODEL_DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(workspaceStoreName)) database.createObjectStore(workspaceStoreName)
      if (!database.objectStoreNames.contains(presetStoreName)) database.createObjectStore(presetStoreName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
    request.onblocked = () => resolve(undefined)
  })
}

let databaseWriteQueue: Promise<void> = Promise.resolve()

function enqueueDatabaseWrite(operation: () => Promise<void>): void {
  databaseWriteQueue = databaseWriteQueue.then(operation, operation)
}

async function writeWorkspaceToDatabase(workspace: ModelWorkspaceState): Promise<void> {
  const database = await openModelDatabase()
  if (!database) return
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(workspaceStoreName, 'readwrite')
    transaction.objectStore(workspaceStoreName).put(workspace, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => resolve()
    transaction.onabort = () => resolve()
  })
  database.close()
}

export function cloneArchitectureGraph(graph: ArchitectureGraph): ArchitectureGraph {
  return JSON.parse(JSON.stringify(graph)) as ArchitectureGraph
}

export function loadModelWorkspace(storage: Storage | undefined = browserStorage()): ModelWorkspaceState {
  if (!storage) return emptyModelWorkspace()
  try {
    return parseModelWorkspace(JSON.parse(storage.getItem(MODEL_WORKSPACE_STORAGE_KEY) ?? 'null') as unknown)
  } catch {
    return emptyModelWorkspace()
  }
}

export function saveModelWorkspaceCache(workspace: ModelWorkspaceState, storage: Storage | undefined = browserStorage()): boolean {
  const snapshot = { ...workspace, updatedAt: workspace.updatedAt || Date.now() }
  if (!storage) return false
  try {
    storage.setItem(MODEL_WORKSPACE_STORAGE_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export function saveModelWorkspace(workspace: ModelWorkspaceState, storage: Storage | undefined = browserStorage()): boolean {
  const snapshot = { ...workspace, updatedAt: workspace.updatedAt || Date.now() }
  enqueueDatabaseWrite(() => writeWorkspaceToDatabase(snapshot))
  return saveModelWorkspaceCache(snapshot, storage)
}

export async function loadModelWorkspaceFromDatabase(): Promise<ModelWorkspaceState | undefined> {
  const database = await openModelDatabase()
  if (!database) return undefined
  const value = await new Promise<unknown>((resolve) => {
    const request = database.transaction(workspaceStoreName, 'readonly').objectStore(workspaceStoreName).get('current')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(undefined)
  })
  database.close()
  const workspace = parseModelWorkspace(value)
  return workspace.updatedAt > 0 ? workspace : undefined
}

export function syncModelPresetDatabase(defaultPresets: ArchitectureGraph[], userPresets: ArchitectureGraph[]): void {
  const updatedAt = Date.now()
  const records: StoredPresetRecord[] = [
    ...defaultPresets.map((graph) => ({ id: graph.id, source: 'default' as const, graph, updatedAt })),
    ...userPresets.map((graph) => ({ id: graph.id, source: 'user' as const, graph, updatedAt })),
  ]
  enqueueDatabaseWrite(async () => {
    const database = await openModelDatabase()
    if (!database) return
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(presetStoreName, 'readwrite')
      const store = transaction.objectStore(presetStoreName)
      store.clear()
      for (const record of records) store.put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
    database.close()
  })
}
