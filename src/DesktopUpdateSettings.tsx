import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

type Status = Awaited<ReturnType<NonNullable<NonNullable<Window['labo']>['getDesktopUpdateStatus']>>>

export function DesktopUpdateSettings() {
  const [status, setStatus] = useState<Status>()
  const [busy, setBusy] = useState<'check' | 'launch' | ''>('')
  const [error, setError] = useState('')
  const api = window.labo

  useEffect(() => {
    if (api?.runtime !== 'electron' || !api.getDesktopUpdateStatus) return
    api.getDesktopUpdateStatus().then(setStatus).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [api])

  if (api?.runtime !== 'electron') return null

  const check = async () => {
    if (!api.getDesktopUpdateStatus) return
    setBusy('check')
    setError('')
    try {
      setStatus(await api.getDesktopUpdateStatus())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }

  const start = async () => {
    setBusy('launch')
    setError('')
    try {
      if (!status?.helperInstalled) {
        await api.openDesktopSetup?.()
        setBusy('')
        return
      }
      await api.launchDesktopUpdate?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy('')
    }
  }

  const label = !status?.helperInstalled ? 'Get LABO AI Setup' : status.updateAvailable ? 'Update and restart' : 'Open LABO AI Setup'
  return <article className="desktop-update-settings">
    <RefreshCw size={15} />
    <div>
      <strong>Desktop updates</strong>
      <p>
        {status?.latestTag
          ? `Installed v${status.currentVersion} · latest ${status.latestTag}. Updates are built locally from the tagged source.`
          : status?.helperInstalled
            ? `Installed v${status.currentVersion}. LABO AI Setup could not reach GitHub right now.`
            : 'Install the lightweight LABO AI Setup once to enable source-first desktop updates.'}
      </p>
      {(error || status?.error) && <small>{error || status?.error}</small>}
      <div className="desktop-update-actions">
        <button disabled={Boolean(busy)} onClick={check} type="button"><RefreshCw size={12} />{busy === 'check' ? 'Checking…' : 'Check for updates'}</button>
        <button disabled={Boolean(busy) || !status} onClick={start} type="button"><Download size={12} />{busy === 'launch' ? 'Opening…' : label}</button>
      </div>
    </div>
  </article>
}
