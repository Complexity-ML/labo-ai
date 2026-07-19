import { AlertTriangle, Blocks, Cable, Check, Clock3, Eye, EyeOff, FolderKanban, KeyRound, Lightbulb, ListChecks, MousePointer2, RotateCcw, Send, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createAgentGraphContext, previewAgentGraphPlan, repairAgentGraphPlan, type AgentGraphMode, type AgentGraphPlan } from '../core/agentic-graph'
import type { ArchitectureGraph, ArchitectureNode } from '../core/ir'
import { modelAtomRegistry } from '../core/model-atoms'
import { validCustomPyTorchModule } from '../core/pytorch-compiler'
import { PythonCodeEditor } from './PythonCodeEditor'
import { StudioSettingsModal } from '../StudioSettingsModal'
import type { CustomPyTorchCard } from './custom-card'

interface AskLaboPanelProps {
  graph: ArchitectureGraph
  customCards: CustomPyTorchCard[]
  dockClassName?: string
  open: boolean
  workspaceSettings: ReactNode
  onApply(graph: ArchitectureGraph, actions: NonNullable<AgentGraphPlan['actions']>): void
  onClose(): void
}

const AGENT_AUTO_APPLY_STORAGE_KEY = 'labo.ask.auto-apply.v1'

function loadAutoApply(): boolean {
  if (window.labo?.runtime === 'web') return false
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

type AgentActivityStatus = 'running' | 'review' | 'applied' | 'failed' | 'discarded'

interface AgentActivity {
  id: string
  prompt: string
  status: AgentActivityStatus
  createdAt: number
  summary?: string
  accepted?: number
  rejected?: number
  missing?: number
  tools?: string[]
  error?: string
  plan?: AgentGraphPlan
}

export function AskLaboPanel({ graph, customCards, dockClassName = '', open, workspaceSettings, onApply, onClose }: AskLaboPanelProps) {
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
  const [activityOpen, setActivityOpen] = useState(false)
  const [activities, setActivities] = useState<AgentActivity[]>([])
  const activeActivityIdRef = useRef<string | undefined>(undefined)
  const activePlan = useMemo(() => plan ? repairAgentGraphPlan(graph, plan) : undefined, [graph, plan])
  const preview = useMemo(() => {
    if (!activePlan) return undefined
    const base = previewAgentGraphPlan(graph, activePlan, graphMode)
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
  }, [activePlan, cardOverrides, graph, graphMode])

  useEffect(() => {
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
    if (window.labo?.runtime !== 'web') window.localStorage.setItem(AGENT_AUTO_APPLY_STORAGE_KEY, String(autoApply))
  }, [autoApply])

  useEffect(() => {
    if (!open && !plan && !activityOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (activityOpen && !open && !plan) {
        setActivityOpen(false)
        return
      }
      setPlan(undefined)
      setCardOverrides({})
      setError('')
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [activityOpen, onClose, open, plan])

  useEffect(() => {
    if (open || plan) setActivityOpen(false)
  }, [open, plan])

  const updateActivity = (id: string, patch: Partial<AgentActivity>) => {
    setActivities((current) => current.map((activity) => activity.id === id ? { ...activity, ...patch } : activity))
  }

  const runAgentRequest = async (prompt: string) => {
    if (!prompt || loading) return
    if (!window.labo?.askLabo) {
      setError('Ask LABO requires the desktop app and an OPENAI_API_KEY.')
      return
    }
    const activityId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    activeActivityIdRef.current = activityId
    setActivities((current) => [{ id: activityId, prompt, status: 'running' as const, createdAt: Date.now() }, ...current].slice(0, 20))
    setActivityOpen(true)
    setLoading(true)
    setError('')
    setPlan(undefined)
    setCardOverrides({})
    try {
      const rawResponse = await window.labo.askLabo({
        request: prompt,
        context: {
          ...createAgentGraphContext(graph, graphMode, customCards),
          responseLocale: navigator.language || 'en',
        },
      })
      const response = repairAgentGraphPlan(graph, rawResponse)
      const responsePreview = previewAgentGraphPlan(graph, response, graphMode)
      const hasAcceptedChanges = responsePreview.acceptedBlocks.length > 0 || responsePreview.acceptedCreatedBlocks.length > 0 || responsePreview.accepted.length > 0 || (response.updatedBlocks?.length ?? 0) > 0 || (response.deletedBlocks?.length ?? 0) > 0 || (response.movedBlocks?.length ?? 0) > 0 || responsePreview.acceptedActions.some((action) => action.type !== 'layout')
      const accepted = responsePreview.acceptedBlocks.length + responsePreview.acceptedCreatedBlocks.length + responsePreview.accepted.length + (response.updatedBlocks?.length ?? 0) + (response.deletedBlocks?.length ?? 0) + (response.movedBlocks?.length ?? 0)
      const rejected = responsePreview.rejectedBlocks.length + responsePreview.rejected.length + responsePreview.rejectedMutations.length + response.warnings.length
      const activityResult = {
        summary: response.summary,
        accepted,
        rejected,
        missing: response.missingBlocks.length,
        tools: response.toolTrace?.map((item) => item.tool) ?? [],
        plan: response,
      }
      if (autoApply && hasAcceptedChanges) {
        updateActivity(activityId, { ...activityResult, status: 'applied' })
        onApply(responsePreview.graph, responsePreview.acceptedActions)
        setActivityOpen(true)
        onClose()
      } else {
        updateActivity(activityId, { ...activityResult, status: 'review' })
        setActivityOpen(false)
        setPlan(response)
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      updateActivity(activityId, { status: 'failed', error: message })
      setActivityOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void runAgentRequest(request.trim())
  }

  const apply = () => {
    if (!preview) return
    if (activeActivityIdRef.current) updateActivity(activeActivityIdRef.current, { status: 'applied' })
    onApply(preview.graph, preview.acceptedActions)
    setPlan(undefined)
    setCardOverrides({})
    setRequest('')
    setActivityOpen(true)
    onClose()
  }

  const reviewFullPlan = (activity: AgentActivity) => {
    if (!activity.plan) return
    const repairedPlan = repairAgentGraphPlan(graph, activity.plan)
    activeActivityIdRef.current = activity.id
    updateActivity(activity.id, { plan: repairedPlan })
    setCardOverrides({})
    setPlan(repairedPlan)
    setActivityOpen(false)
  }

  const clearActivities = () => {
    activeActivityIdRef.current = undefined
    setActivities([])
    setActivityOpen(false)
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

  const closeOverlay = () => {
    if (plan) {
      if (activeActivityIdRef.current) updateActivity(activeActivityIdRef.current, { status: 'discarded' })
      setPlan(undefined)
      setCardOverrides({})
      setActivityOpen(true)
    }
    setError('')
    onClose()
  }

  return <div className={`ask-labo-backdrop ${dockClassName} ${plan ? 'review-open' : ''}`} onPointerDown={(event) => { if (event.target === event.currentTarget) closeOverlay() }}>
  <aside aria-label="Ask LABO" aria-modal={Boolean(plan)} className={`ask-labo-panel ${plan ? 'has-plan' : ''}`} role={plan ? 'dialog' : 'region'}>
    <header className="ask-labo-header">
      <span>{plan ? <Sparkles size={15} /> : <Settings2 size={15} />}{plan ? 'Review graph plan' : 'LABO settings'}</span>
      <button aria-label="Close Ask LABO" onClick={closeOverlay}><X size={15} /></button>
    </header>

    {activityOpen && !open && !plan && <section aria-label="Agent activity" className="ask-labo-activity">
      <header>
        <span><ListChecks size={14} /><strong>Agent activity</strong><small>{activities.length} task{activities.length === 1 ? '' : 's'}</small></span>
        <div><button disabled={loading || activities.length === 0} onClick={clearActivities} type="button">Clear</button><button aria-label="Close agent activity" onClick={() => setActivityOpen(false)} type="button"><X size={13} /></button></div>
      </header>
      {activities.length === 0 ? <p className="ask-labo-activity-empty">Your agent runs, validation results and errors will appear here.</p> : <ol>
        {activities.map((activity) => <li data-status={activity.status} key={activity.id}>
          <div className="ask-labo-activity-status"><span>{activity.status === 'running' ? <Clock3 size={12} /> : activity.status === 'failed' ? <AlertTriangle size={12} /> : <Check size={12} />}{activity.status === 'review' ? 'Awaiting full-plan review' : activity.status === 'discarded' ? 'Closed — plan saved' : activity.status}</span><time>{new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
          <strong>{activity.prompt}</strong>
          {activity.status === 'running' ? <p>Inspecting cards and validating graph changes…</p> : activity.error ? <p>{activity.error}</p> : activity.summary && <p>{activity.summary}</p>}
          {activity.status !== 'running' && !activity.error && <div className="ask-labo-activity-metrics"><span>{activity.accepted ?? 0} accepted</span><span>{activity.rejected ?? 0} rejected</span><span>{activity.missing ?? 0} missing</span>{Boolean(activity.tools?.length) && <span>{activity.tools!.length} tools</span>}</div>}
          {Boolean(activity.tools?.length) && <code className="ask-labo-activity-tools">{activity.tools!.join(' → ')}</code>}
          <div className="ask-labo-activity-actions">
            {activity.plan && activity.status !== 'applied' && <button aria-label={`Review full agent plan: ${activity.prompt}`} onClick={() => reviewFullPlan(activity)} type="button"><Check size={11} />Review full plan</button>}
            <button aria-label={`Retry agent task: ${activity.prompt}`} disabled={loading} onClick={() => { setRequest(activity.prompt); setActivityOpen(false); void runAgentRequest(activity.prompt) }} type="button"><RotateCcw size={11} />Retry</button>
          </div>
        </li>)}
      </ol>}
    </section>}

    <form className="ask-labo-form" onSubmit={(event) => void submit(event)}>
      <label htmlFor="ask-labo-request">Ask LABO</label>
      <div className="ask-labo-composer">
        <textarea
          aria-label="What should these blocks build?"
          id="ask-labo-request"
          onChange={(event) => setRequest(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            event.currentTarget.form?.requestSubmit()
          }}
          placeholder="Ask LABO to build or edit your architecture…"
          rows={1}
          value={request}
        />
        <div className="ask-labo-composer-meta"><span><Sparkles size={12} />LABO agent</span><small>{autoApply ? 'Auto apply' : 'Review'} · {graphMode === 'parallel' ? 'New parallel' : 'Extend current'}</small></div>
        <button aria-label="Propose graph changes" disabled={loading || !request.trim() || settings?.configured === false} title={loading ? 'Inspecting graph' : 'Send to LABO'} type="submit"><Send size={15} /><span>{loading ? 'Inspecting…' : 'Send'}</span></button>
      </div>
      <button aria-expanded={activityOpen} aria-label="Open agent activity" className="ask-labo-activity-trigger" onClick={() => setActivityOpen((current) => !current)} title="Agent activity" type="button"><ListChecks size={14} />{activities.length > 0 && <b>{activities.find((activity) => activity.status === 'running') ? '…' : activities.length}</b>}</button>
    </form>

    {open && <StudioSettingsModal onClose={closeOverlay} sections={[
      { id: 'workspaces', label: 'Workspaces', icon: <FolderKanban size={13} />, content: <div className="ask-labo-workspace-settings">{workspaceSettings}</div> },
      { id: 'agent', label: 'Agent', icon: <Sparkles size={13} />, content: <div className="ask-labo-settings-content">
        <div className="ask-labo-intro"><strong>Atomic graph agent</strong><p>LABO inspects the typed card library, composes missing reusable cards when possible, wires the graph and returns an explicit plan.</p></div>
        <section className="ask-labo-mode" aria-label="Agent apply mode"><div><button aria-pressed={!autoApply} onClick={() => setAutoApply(false)} type="button">Review</button><button aria-pressed={autoApply} onClick={() => setAutoApply(true)} type="button">Auto apply</button></div><small>{autoApply ? 'Apply every locally valid operation immediately.' : 'Preview cards and elastics before applying.'}</small></section>
        <section className="ask-labo-mode ask-labo-scope" aria-label="Agent graph scope"><div><button aria-pressed={graphMode === 'extend'} disabled={loading} onClick={() => { setGraphMode('extend'); setPlan(undefined) }} type="button">Extend current</button><button aria-pressed={graphMode === 'parallel'} disabled={loading} onClick={() => { setGraphMode('parallel'); setPlan(undefined) }} type="button">New parallel</button></div><small>{graphMode === 'parallel' ? 'Keep the existing graph read-only and build beside it.' : 'Connect new cards to compatible free ports.'}</small></section>
        <section className="ask-labo-key-settings">
          <div className="ask-labo-key-heading"><span><KeyRound size={13} />OpenAI API key</span>{settings?.configured && <b><span className="status-dot" />Connected</b>}</div>
          {settings?.configured ? <><div className="ask-labo-key-status"><ShieldCheck size={16} /><span><strong>{settings.source === 'secure-storage' ? 'Stored securely for this user' : 'Provided by the app environment'}</strong><small>The key value is never exposed back to the interface.</small></span></div><div className="ask-labo-key-actions"><button disabled={credentialBusy} onClick={() => void testApiKey()} type="button">Test connection</button>{settings.source === 'secure-storage' && <button className={confirmDelete ? 'confirm-delete' : ''} disabled={credentialBusy} onClick={() => void deleteApiKey()} type="button"><Trash2 size={12} />{confirmDelete ? 'Confirm removal' : 'Remove key'}</button>}{window.labo?.runtime === 'web' && <a href="/dashboard/settings" target="_top">Manage account</a>}</div></> : settings?.authRequired ? <div className="ask-labo-key-form"><p>Everything except Ask LABO works without an account.</p><a className="ask-labo-sign-in" href="/auth/signin?callbackUrl=%2Flabo-ai%2Flive" target="_top"><ShieldCheck size={12} />Sign in to use the agent</a></div> : <form className="ask-labo-key-form" onSubmit={(event) => void saveApiKey(event)}><p>No API key configured for this user.</p><label htmlFor="openai-api-key">OpenAI API key</label><div><input autoComplete="off" id="openai-api-key" onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" type={showApiKey ? 'text' : 'password'} value={apiKey} /><button aria-label={showApiKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowApiKey((current) => !current)} type="button">{showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}</button></div><button disabled={credentialBusy || apiKey.trim().length < 20 || settings?.encryptionAvailable === false} type="submit"><ShieldCheck size={12} />{credentialBusy ? 'Saving…' : 'Save and verify key'}</button>{settings?.encryptionAvailable === false && <small>Secure storage requires the LABO AI desktop app and an available system keychain.</small>}</form>}
          {credentialMessage && <p className="ask-labo-key-message">{credentialMessage}</p>}
        </section>
      </div> },
      { id: 'studio', label: 'Application', icon: <Settings2 size={13} />, content: <div className="studio-settings-empty"><strong>One LABO AI workspace</strong><p>Model, Training and Tokenizer Studio share this private profile, these settings and the same automatic-save policy.</p></div> },
      { id: 'tips', label: 'Tips', icon: <Lightbulb size={13} />, content: <div className="ask-labo-tips">
        <article><span><MousePointer2 size={14} />Select & delete</span><strong>Delete several cards or a full graph</strong><p>Switch to <b>Edit cards</b>, then drag on empty canvas around the cards. Hold Shift, Cmd or Ctrl while clicking to adjust the selection, then choose <b>Delete selection</b>. Connected elastics are removed with the cards.</p></article>
        <article><span><Settings2 size={14} />Edit a card</span><strong>Open card settings</strong><p>In <b>Edit cards</b>, click a card to open its settings. You can also right-click a card for the Edit and Delete actions.</p></article>
        <article><span><Cable size={14} />Add & wire</span><strong>Compose manually</strong><p>Use <b>Add blocks</b>, click a card to place it automatically or drag it onto the canvas, then drag between compatible typed plugs.</p></article>
        <article><span><FolderKanban size={14} />Save & compare</span><strong>Keep each architecture reusable</strong><p>Open <b>Settings → Workspaces</b> to name, save, reset or place complete presets side by side.</p></article>
        <article><span><Sparkles size={14} />Ask LABO</span><strong>Build with natural language</strong><p>Describe the architecture in the footer prompt. Configure review, auto-apply and parallel mode under <b>Settings → Agent</b>.</p></article>
      </div> },
    ]} />}

    {error && <div className="ask-labo-error"><AlertTriangle size={14} /><span>{error}</span></div>}

    {activePlan && preview && <div className="ask-labo-result">
      <section>
        <h3>Plan</h3>
        <p>{activePlan.summary}</p>
      </section>

      {(activePlan.toolTrace?.length ?? 0) > 0 && <section>
        <h3>Tools used</h3>
        <ul className="ask-labo-tool-trace">{activePlan.toolTrace!.map((item, index) => <li data-status={item.status} key={`${item.tool}-${index}`}><code>{item.tool}</code><span>{item.summary}</span></li>)}</ul>
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
        <h3>{preview.acceptedCreatedBlocks.length} generated reusable card{preview.acceptedCreatedBlocks.length === 1 ? '' : 's'} ready</h3>
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

      {((activePlan.updatedBlocks?.length ?? 0) > 0 || (activePlan.deletedBlocks?.length ?? 0) > 0 || (activePlan.movedBlocks?.length ?? 0) > 0) && <section>
        <h3>Existing graph changes</h3>
        {(activePlan.updatedBlocks ?? []).map((change) => <p key={`edit-${change.nodeId}`}><code>edit {change.nodeId}</code> · {change.reason}</p>)}
        {(activePlan.deletedBlocks?.length ?? 0) > 3
          ? <p><code>delete architecture</code> · {activePlan.deletedBlocks!.length} cards and their elastics</p>
          : (activePlan.deletedBlocks ?? []).map((change) => <p key={`delete-${change.nodeId}`}><code>delete {change.nodeId}</code> · {change.reason}</p>)}
        {(activePlan.movedBlocks ?? []).map((change) => <p key={`move-${change.nodeId}`}><code>move {change.nodeId}</code> · {change.reason}</p>)}
      </section>}

      {preview.acceptedActions.length > 0 && <section>
        <h3>Actions after approval</h3>
        {preview.acceptedActions.map((action, index) => <p key={`${action.type}-${index}`}><code>{action.type}{action.type === 'run' ? `:${action.mode}` : action.type === 'export' ? `:${action.kind}` : action.type === 'save-preset' ? `:${action.name}` : `:${action.scope}`}</code> · {action.reason}</p>)}
      </section>}

      {activePlan.missingBlocks.length > 0 && <section className="ask-labo-missing">
        <h3>Missing blocks</h3>
        {activePlan.missingBlocks.map((block, index) => <div key={`${block.atomId ?? block.label}-${index}`}>
          <AlertTriangle size={13} />
          <span><strong>{block.label}</strong><small>{block.reason}</small></span>
        </div>)}
      </section>}

      {(preview.rejectedBlocks.length > 0 || preview.rejected.length > 0 || preview.rejectedMutations.length > 0 || activePlan.warnings.length > 0) && <section className="ask-labo-warnings">
        <h3>Not applied</h3>
        {preview.rejectedBlocks.map(({ block, reason }) => <p key={`${block.nodeId}-${reason}`}>{block.nodeId}: {reason}</p>)}
        {preview.rejected.map(({ connection, reason }) => <p key={`${connection.sourceId}-${connection.targetId}-${reason}`}>{connection.sourceId} → {connection.targetId}: {reason}</p>)}
        {preview.rejectedMutations.map(({ nodeId, action, reason }, index) => <p key={`${nodeId ?? action?.type ?? 'mutation'}-${index}`}>{nodeId ?? action?.type}: {reason}</p>)}
        {activePlan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </section>}

    </div>}

    {activePlan && preview && <div className="ask-labo-actions">
      <span className="ask-labo-approval-summary">Ready · {preview.acceptedBlocks.length + preview.acceptedCreatedBlocks.length} cards · {preview.accepted.length} elastic{preview.accepted.length === 1 ? '' : 's'}</span>
      <button className="ask-labo-cancel" onClick={() => { if (activeActivityIdRef.current) updateActivity(activeActivityIdRef.current, { status: 'discarded' }); setPlan(undefined); setCardOverrides({}); setActivityOpen(true) }} type="button">Discard</button>
      <button aria-label="Apply full graph plan" className="ask-labo-apply" disabled={preview.acceptedBlocks.length === 0 && preview.acceptedCreatedBlocks.length === 0 && preview.accepted.length === 0 && (activePlan.updatedBlocks?.length ?? 0) === 0 && (activePlan.deletedBlocks?.length ?? 0) === 0 && (activePlan.movedBlocks?.length ?? 0) === 0 && preview.acceptedActions.every((action) => action.type === 'layout')} onClick={apply} type="button"><Check size={13} />Apply full plan</button>
    </div>}

    {editingCard && editorDraft && <div className="ask-labo-card-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) { setEditingCard(undefined); setEditorDraft(undefined); setEditorError('') } }}>
      <section aria-label="Edit agent card" aria-modal="true" className="ask-labo-card-modal" onPointerDown={(event) => event.stopPropagation()} role="dialog">
        <header><strong>Edit card</strong><button aria-label="Close card editor" onClick={() => setEditingCard(undefined)} type="button"><X size={13} /></button></header>
        <label><span>Name</span><input aria-label="Agent card name" onChange={(event) => setEditorDraft((current) => current ? { ...current, label: event.target.value } : current)} value={editorDraft.label} /></label>
        <label><span>Block ID</span><input aria-label="Agent card ID" disabled value={editingCard.id} /></label>
        {editingCard.kind === 'custom-pytorch' ? <label><span>PyTorch module</span><PythonCodeEditor ariaLabel="Agent card PyTorch module" className="compact-python-editor" onChange={(value) => setEditorDraft((current) => current ? { ...current, code: value } : current)} value={editorDraft.code ?? ''} /></label> : <div className="ask-labo-card-settings">
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
  </div>
}
