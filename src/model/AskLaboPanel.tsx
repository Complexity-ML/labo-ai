import { AlertTriangle, Blocks, Cable, Check, Eye, EyeOff, KeyRound, Send, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createAgentGraphContext, previewAgentGraphPlan, type AgentGraphPlan } from '../core/agentic-graph'
import type { ArchitectureGraph } from '../core/ir'

interface AskLaboPanelProps {
  graph: ArchitectureGraph
  open: boolean
  onApply(graph: ArchitectureGraph): void
  onClose(): void
}

export function AskLaboPanel({ graph, open, onApply, onClose }: AskLaboPanelProps) {
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
  const preview = useMemo(() => plan ? previewAgentGraphPlan(graph, plan) : undefined, [graph, plan])

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
    try {
      const response = await window.labo.askLabo({ request: prompt, context: createAgentGraphContext(graph) })
      setPlan(response)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const apply = () => {
    if (!preview || (preview.acceptedBlocks.length === 0 && preview.accepted.length === 0)) return
    onApply(preview.graph)
    onClose()
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
      <p>I can add atomic blocks from the LABO library, wire them to the current graph, or report a capability that is still missing.</p>
      <small>Nothing is added or wired until you approve the preview. Existing blocks are never moved or deleted.</small>
    </div>

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

      {preview.acceptedBlocks.length > 0 && <section>
        <h3>{preview.acceptedBlocks.length} atomic block{preview.acceptedBlocks.length === 1 ? '' : 's'} ready</h3>
        <div className="ask-labo-added-blocks">
          {preview.acceptedBlocks.map((block) => <div key={block.nodeId}>
            <Blocks size={13} />
            <span><strong>{block.nodeId}</strong><code>{block.atomId}</code><small>{block.reason}</small></span>
          </div>)}
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

      {plan.missingBlocks.length > 0 && <section className="ask-labo-missing">
        <h3>Missing blocks</h3>
        {plan.missingBlocks.map((block, index) => <div key={`${block.atomId ?? block.label}-${index}`}>
          <AlertTriangle size={13} />
          <span><strong>{block.label}</strong><small>{block.reason}</small></span>
        </div>)}
      </section>}

      {(preview.rejectedBlocks.length > 0 || preview.rejected.length > 0 || plan.warnings.length > 0) && <section className="ask-labo-warnings">
        <h3>Not applied</h3>
        {preview.rejectedBlocks.map(({ block, reason }) => <p key={`${block.nodeId}-${reason}`}>{block.nodeId}: {reason}</p>)}
        {preview.rejected.map(({ connection, reason }) => <p key={`${connection.sourceId}-${connection.targetId}-${reason}`}>{connection.sourceId} → {connection.targetId}: {reason}</p>)}
        {plan.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </section>}

      <div className="ask-labo-actions">
        <button className="ask-labo-cancel" onClick={() => setPlan(undefined)} type="button">Discard</button>
        <button className="ask-labo-apply" disabled={preview.acceptedBlocks.length === 0 && preview.accepted.length === 0} onClick={apply} type="button"><Check size={13} />Apply graph plan</button>
      </div>
    </div>}
  </aside>
}
