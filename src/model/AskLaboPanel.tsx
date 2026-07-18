import { AlertTriangle, Blocks, Cable, Check, Eye, EyeOff, KeyRound, Send, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createAgentGraphContext, previewAgentGraphPlan, repairAgentGraphPlan, type AgentGraphMode, type AgentGraphPlan } from '../core/agentic-graph'
import type { ArchitectureGraph, ArchitectureNode } from '../core/ir'
import { modelAtomRegistry } from '../core/model-atoms'
import { validCustomPyTorchModule } from '../core/pytorch-compiler'
import type { CustomPyTorchCard } from './custom-card'

interface AskLaboPanelProps {
  graph: ArchitectureGraph
  customCards: CustomPyTorchCard[]
  open: boolean
  onApply(graph: ArchitectureGraph, actions: NonNullable<AgentGraphPlan['actions']>): void
  onClose(): void
}

const AGENT_AUTO_APPLY_STORAGE_KEY = 'labo.ask.auto-apply.v1'

function loadAutoApply(): boolean {
  try {
    return window.localStorage.getItem(AGENT_AUTO_APPLY_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

interface AgentCardOverride {
  label: string
  attributes?: Record<string, number | string | boolean>
  code?: string
}

export function AskLaboPanel({ graph, customCards, open, onApply, onClose }: AskLaboPanelProps) {
  const [request, setRequest] = useState('')
  const [plan, setPlan] = useState<AgentGraphPlan>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState<OpenAISettingsStatus>()
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [credentialBusy, setCredentialBusy] = useState(false)
  const [credentialMessage, setCredentialMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [autoApply, setAutoApply] = useState(loadAutoApply)
  const [graphMode, setGraphMode] = useState<AgentGraphMode>('extend')
  const [cardOverrides, setCardOverrides] = useState<Record<string, AgentCardOverride>>({})
  const [editingCard, setEditingCard] = useState<ArchitectureNode>()
  const [editorDraft, setEditorDraft] = useState<AgentCardOverride>()
  const [editorError, setEditorError] = useState('')
  const preview = useMemo(() => {
    if (!plan) return undefined
    const base = previewAgentGraphPlan(graph, plan, graphMode)
    return {
      ...base,
      graph: {
        ...base.graph,
        nodes: base.graph.nodes.map((node) => {
          const override = cardOverrides[node.id]
          return override ? { ...node, label: override.label, attributes: override.attributes, code: override.code } : node
        }),
      },
    }
  }, [cardOverrides, graph, graphMode, plan])

  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    if (!window.labo?.getOpenAISettings) {
      setSettings({ configured: false, source: 'none', encryptionAvailable: false })
      return
    }
    void window.labo.getOpenAISettings()
      .then(setSettings)
      .catch((reason) => setCredentialMessage(reason instanceof Error ? reason.message : String(reason)))
  }, [open])

  useEffect(() => {
    window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, String(autoApply))
  }, [autoApply])

  if (!open) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const prompt = request.trim()
    if (!prompt || loading) return
    if (!window.labo?.askLabo) {
      setError('Ask LABO requires the desktop app and an OPENAI_API_KEY.')
      return
    }
    setLoading(true)
    setError('')
    setPlan(undefined)
    setCardOverrides({})
    try {
      const rawResponse = await window.labo.askLabo({ request: prompt, context: createAgentGraphContext(graph, graphMode, customCards) })
      const response = repairAgentGraphPlan(graph, rawResponse)
      const responsePreview = previewAgentGraphPlan(graph, response, graphMode)
      const hasAcceptedChanges = responsePreview.acceptedBlocks.length > 0 || responsePreview.acceptedCreatedBlocks.length > 0 || responsePreview.accepted.length > 0 || (response.updatedBlocks?.length ?? 0) > 0 || (response.deletedBlocks?.length ?? 0) > 0 || (response.movedBlocks?.length ?? 0) > 0 || responsePreview.acceptedActions.some((action) => action.type !== 'layout')
      if (autoApply && hasAcceptedChanges) {
        onApply(responsePreview.graph, responsePreview.acceptedActions)
        onClose()
      } else setPlan(response)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    if (!preview) return
    onApply(preview.graph, preview.acceptedActions)
    onClose()
  }

  const openCardEditor = (nodeId: string) => {
    const node = preview?.graph.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    setEditingCard(node)
    setEditorDraft({ label: node.label, attributes: node.attributes ? { ...node.attributes } : undefined, code: node.code })
    setEditorError('')
  }

  const saveCardEditor = () => {
    if (!editingCard || !editorDraft) return
    const label = editorDraft.label.trim()
    if (!label) {
      setEditorError('Give the card a name.')
      return
    }
    if (editingCard.kind === 'custom-pytorch' && !validCustomPyTorchModule(editorDraft.code ?? '')) {
      setEditorError('Use one safe nn.Module constructor with literal arguments only.')
      return
    }
    setCardOverrides((current) => ({ ...current, [editingCard.id]: { ...editorDraft, label, code: editorDraft.code?.trim() } }))
    setEditingCard(undefined)
    setEditorDraft(undefined)
    setEditorError('')
  }

  const saveApiKey = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.labo?.saveOpenAIKey || !apiKey.trim() || credentialBusy) return
    setCredentialBusy(true)
    setCredentialMessage('')
    try {
      const status = await window.labo.saveOpenAIKey(apiKey)
      setSettings(status)
      setApiKey('')
      if (window.labo.testOpenAIKey) {
        await window.labo.testOpenAIKey()
        setCredentialMessage('Key saved and verified with OpenAI.')
      } else setCredentialMessage('Key saved securely.')
    } catch (reason) {
      setCredentialMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setCredentialBusy(false)
    }
  }

  const testApiKey = async () => {
    if (!window.labo?.testOpenAIKey || credentialBusy) return
    setCredentialBusy(true)
    setCredentialMessage('')
    try {
      await window.labo.testOpenAIKey()
      setCredentialMessage('OpenAI connection successful.')
    } catch (reason) {
      setCredentialMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setCredentialBusy(false)
    }
  }

  const deleteApiKey = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (!window.labo?.deleteOpenAIKey || credentialBusy) return
    setCredentialBusy(true)
    setCredentialMessage('')
    try {
      setSettings(await window.labo.deleteOpenAIKey())
      setConfirmDelete(false)
      setCredentialMessage('API key removed from this user account.')
    } catch (reason) {
      setCredentialMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setCredentialBusy(false)
    }
  }

  return <aside aria-label="Ask LABO" aria-modal="false" className="ask-labo-panel" role="dialog">
    <header className="ask-labo-header">
      <span><Sparkles size={15} />Ask LABO</span>
      <button aria-label="Close Ask LABO" onClick={onClose}><X size={15} /></button>
    </header>

    <div className="ask-labo-intro">
      <strong>Atomic graph agent</strong>
      <p>I inspect and search the card library, then use explicit tools to build, edit, arrange, run, save or export your graph.</p>
      <small>Review mode queues every mutation until you approve the plan. Parallel mode keeps all existing work read-only.</small>
    </div>

    <section className="ask-labo-mode" aria-label="Agent apply mode">
      <div>
        <button aria-pressed={!autoApply} onClick={() => setAutoApply(false)} type="button">Review</button>
        <button aria-pressed={autoApply} onClick={() => setAutoApply(true)} type="button">Auto apply</button>
      </div>
      <small>{autoApply ? 'Every locally valid operation is applied immediately. Invalid operations are skipped without asking for approval.' : 'Preview every block, generated card and elastic before applying.'}</small>
    </section>

    <section className="ask-labo-mode ask-labo-scope" aria-label="Agent graph scope">
      <div>
        <button aria-pressed={graphMode === 'extend'} disabled={loading} onClick={() => { setGraphMode('extend'); setPlan(undefined) }} type="button">Extend current</button>
        <button aria-pressed={graphMode === 'parallel'} disabled={loading} onClick={() => { setGraphMode('parallel'); setPlan(undefined) }} type="button">New parallel</button>
      </div>
      <small>{graphMode === 'parallel' ? 'Build a separate architecture beside the current graph. Existing cards and elastics are read-only.' : 'The agent may connect new cards to free ports in the current architecture.'}</small>
    </section>

    <section className="ask-labo-key-settings">
      <div className="ask-labo-key-heading"><span><KeyRound size={13} />OpenAI API key</span>{settings?.configured && <b><span className="status-dot" />Connected</b>}</div>
      {settings?.configured ? <>
        <div className="ask-labo-key-status">
          <ShieldCheck size={16} />
          <span><strong>{settings.source === 'secure-storage' ? 'Stored securely for this user' : 'Provided by the app environment'}</strong><small>The key value is never exposed back to the interface.</small></span>
        </div>
        <div className="ask-labo-key-actions">
          <button disabled={credentialBusy} onClick={() => void testApiKey()} type="button">Test connection</button>
          {settings.source === 'secure-storage' && <button className={confirmDelete ? 'confirm-delete' : ''} disabled={credentialBusy} onClick={() => void deleteApiKey()} type="button"><Trash2 size={12} />{confirmDelete ? 'Confirm removal' : 'Remove key'}</button>}
        </div>
      </> : <form className="ask-labo-key-form" onSubmit={(event) => void saveApiKey(event)}>
        <p>No API key configured for this user.</p>
        <label htmlFor="openai-api-key">OpenAI API key</label>
        <div>
          <input autoComplete="off" id="openai-api-key" onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" type={showApiKey ? 'text' : 'password'} value={apiKey} />
          <button aria-label={showApiKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowApiKey((current) => !current)} type="button">{showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        </div>
        <button disabled={credentialBusy || apiKey.trim().length < 20 || settings?.encryptionAvailable === false} type="submit"><ShieldCheck size={12} />{credentialBusy ? 'Saving…' : 'Save and verify key'}</button>
        {settings?.encryptionAvailable === false && <small>Secure storage requires the LABO AI desktop app and an available system keychain.</small>}
      </form>}
      {credentialMessage && <p className="ask-labo-key-message">{credentialMessage}</p>}
    </section>

    <form className="ask-labo-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="ask-labo-request">What should these blocks build?</label>
      <textarea
        autoFocus
        id="ask-labo-request"
        onChange={(event) => setRequest(event.target.value)}
        placeholder="Example: Connect the router to the existing expert blocks."
        rows={4}
        value={request}
      />
      <button disabled={loading || !request.trim() || settings?.configured === false} type="submit"><Send size={13} />{loading ? 'Inspecting graph…' : 'Propose graph changes'}</button>
    </form>

    {error && <div className="ask-labo-error"><AlertTriangle size={14} /><span>{error}</span></div>}

    {plan && preview && <div className="ask-labo-result">
      <section>
        <h3>Plan</h3>
        <p>{plan.summary}</p>
      </section>

      {(plan.toolTrace?.length ?? 0) > 0 && <section>
        <h3>Tools used</h3>
        <ul className="ask-labo-tool-trace">{plan.toolTrace!.map((item, index) => <li data-status={item.status} key={`${item.tool}-${index}`}><code>{item.tool}</code><span>{item.summary}</span></li>)}</ul>
      </section>}

      {preview.acceptedBlocks.length > 0 && <section>
        <h3>{preview.acceptedBlocks.length} atomic block{preview.acceptedBlocks.length === 1 ? '' : 's'} ready</h3>
        <div className="ask-labo-added-blocks">
          {preview.acceptedBlocks.map((block) => {
            const node = preview.graph.nodes.find((candidate) => candidate.id === block.nodeId)
            return <div key={block.nodeId}>
            <Blocks size={13} />
            <span><strong>{node?.label ?? block.nodeId}</strong><code>{block.atomId}</code><small>{block.reason}</small></span>
            <button aria-label={`Edit ${node?.label ?? block.nodeId}`} onClick={() => openCardEditor(block.nodeId)} type="button">Edit</button>
          </div>})}
        </div>
      </section>}

      {preview.acceptedCreatedBlocks.length > 0 && <section>
        <h3>{preview.acceptedCreatedBlocks.length} generated card{preview.acceptedCreatedBlocks.length === 1 ? '' : 's'} ready</h3>
        <div className="ask-labo-created-blocks">
          {preview.acceptedCreatedBlocks.map((block) => {
            const node = preview.graph.nodes.find((candidate) => candidate.id === block.nodeId)
            return <div key={block.nodeId}>
            <Blocks size={13} />
            <span><strong>{node?.label ?? block.label}</strong><code>{node?.code ?? block.pytorchModule}</code><small>{block.reason}</small></span>
            <button aria-label={`Edit ${node?.label ?? block.label}`} onClick={() => openCardEditor(block.nodeId)} type="button">Edit</button>
          </div>})}
        </div>
      </section>}

      {preview.accepted.length > 0 && <section>
        <h3>{preview.accepted.length} elastic{preview.accepted.length === 1 ? '' : 's'} ready</h3>
        <ul className="ask-labo-connections">
          {preview.accepted.map((connection) => <li key={`${connection.sourceId}.${connection.sourcePortId}-${connection.targetId}.${connection.targetPortId}`}>
            <Cable size={13} />
            <div><code>{connection.sourceId}.{connection.sourcePortId}</code><span>→</span><code>{connection.targetId}.{connection.targetPortId}</code><small>{connection.reason}</small></div>
          </li>)}
        </ul>
      </section>}

      {((plan.updatedBlocks?.length ?? 0) > 0 || (plan.deletedBlocks?.length ?? 0) > 0 || (plan.movedBlocks?.length ?? 0) > 0) && <section>
        <h3>Existing graph changes</h3>
        {(plan.updatedBlocks ?? []).map((change) => <p key={`edit-${change.nodeId}`}><code>edit {change.nodeId}</code> · {change.reason}</p>)}
        {(plan.deletedBlocks?.length ?? 0) > 3
          ? <p><code>delete architecture</code> · {plan.deletedBlocks!.length} cards and their elastics</p>
          : (plan.deletedBlocks ?? []).map((change) => <p key={`delete-${change.nodeId}`}><code>delete {change.nodeId}</code> · {change.reason}</p>)}
        {(plan.movedBlocks ?? []).map((change) => <p key={`move-${change.nodeId}`}><code>move {change.nodeId}</code> · {change.reason}</p>)}
      </section>}

      {preview.acceptedActions.length > 0 && <section>
        <h3>Actions after approval</h3>
        {preview.acceptedActions.map((action, index) => <p key={`${action.type}-${index}`}><code>{action.type}{action.type === 'run' ? `:${action.mode}` : action.type === 'export' ? `:${action.kind}` : action.type === 'save-preset' ? `:${action.name}` : `:${action.scope}`}</code> · {action.reason}</p>)}
      </section>}

      {plan.missingBlocks.length > 0 && <section className="ask-labo-missing">
        <h3>Missing blocks</h3>
        {plan.missingBlocks.map((block, index) => <div key={`${block.atomId ?? block.label}-${index}`}>
          <AlertTriangle size={13} />
          <span><strong>{block.label}</strong><small>{block.reason}</small></span>
        </div>)}
      </section>}

      {(preview.rejectedBlocks.length > 0 || preview.rejected.length > 0 || preview.rejectedMutations.length > 0 || plan.warnings.length > 0) && <section className="ask-labo-warnings">
        <h3>Not applied</h3>
        {preview.rejectedBlocks.map(({ block, reason }) => <p key={`${block.nodeId}-${reason}`}>{block.nodeId}: {reason}</p>)}
        {preview.rejected.map(({ connection, reason }) => <p key={`${connection.sourceId}-${connection.targetId}-${reason}`}>{connection.sourceId} → {connection.targetId}: {reason}</p>)}
        {preview.rejectedMutations.map(({ nodeId, action, reason }, index) => <p key={`${nodeId ?? action?.type ?? 'mutation'}-${index}`}>{nodeId ?? action?.type}: {reason}</p>)}
        {plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </section>}

      <div className="ask-labo-actions">
        <button className="ask-labo-cancel" onClick={() => { setPlan(undefined); setCardOverrides({}) }} type="button">Discard</button>
        <button className="ask-labo-apply" disabled={preview.acceptedBlocks.length === 0 && preview.acceptedCreatedBlocks.length === 0 && preview.accepted.length === 0 && (plan.updatedBlocks?.length ?? 0) === 0 && (plan.deletedBlocks?.length ?? 0) === 0 && (plan.movedBlocks?.length ?? 0) === 0 && preview.acceptedActions.every((action) => action.type === 'layout')} onClick={apply} type="button"><Check size={13} />Apply graph plan</button>
      </div>
    </div>}

    {editingCard && editorDraft && <div className="ask-labo-card-modal-backdrop">
      <section aria-label="Edit agent card" aria-modal="true" className="ask-labo-card-modal" role="dialog">
        <header><strong>Edit card</strong><button aria-label="Close card editor" onClick={() => setEditingCard(undefined)} type="button"><X size={13} /></button></header>
        <label><span>Name</span><input aria-label="Agent card name" onChange={(event) => setEditorDraft((current) => current ? { ...current, label: event.target.value } : current)} value={editorDraft.label} /></label>
        <label><span>Block ID</span><input aria-label="Agent card ID" disabled value={editingCard.id} /></label>
        {editingCard.kind === 'custom-pytorch' ? <label><span>PyTorch module</span><textarea aria-label="Agent card PyTorch module" onChange={(event) => setEditorDraft((current) => current ? { ...current, code: event.target.value } : current)} rows={4} spellCheck={false} value={editorDraft.code ?? ''} /></label> : <div className="ask-labo-card-settings">
          {modelAtomRegistry[editingCard.atomId ?? '']?.settings.map((setting) => {
            const value = editorDraft.attributes?.[setting.id] ?? setting.default
            return <label key={setting.id}><span>{setting.id}</span>{setting.type === 'boolean'
              ? <input aria-label={`Agent card setting ${setting.id}`} checked={Boolean(value)} onChange={(event) => setEditorDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: event.target.checked } } : current)} type="checkbox" />
              : setting.type === 'select'
                ? <select aria-label={`Agent card setting ${setting.id}`} onChange={(event) => setEditorDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: event.target.value } } : current)} value={String(value)}>{setting.options?.map((option) => <option key={option}>{option}</option>)}</select>
                : <input aria-label={`Agent card setting ${setting.id}`} onChange={(event) => setEditorDraft((current) => current ? { ...current, attributes: { ...current.attributes, [setting.id]: setting.type === 'number' ? Number(event.target.value) : event.target.value } } : current)} type={setting.type === 'number' ? 'number' : 'text'} value={String(value)} />}</label>
          })}
        </div>}
        {editorError && <p role="alert">{editorError}</p>}
        <footer><button onClick={() => setEditingCard(undefined)} type="button">Cancel</button><button onClick={saveCardEditor} type="button">Save card</button></footer>
      </section>
    </div>}
  </aside>
}
