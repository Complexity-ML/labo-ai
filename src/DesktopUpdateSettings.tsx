import { CheckCircle2, Download, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

type Status = Awaited<ReturnType<NonNullable<NonNullable<Window['labo']>['getDesktopUpdateStatus']>>>

export function DesktopUpdateSettings() {
  const [status, setStatus] = useState<Status>()
  const [channel, setChannel] = useState<DesktopUpdateChannel>('stable')
  const [busy, setBusy] = useState<'check' | 'launch' | ''>('')
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  const api = window.labo

  useEffect(() => {
    if (api?.runtime !== 'electron' || !api.getDesktopUpdateStatus) return
    api.getDesktopUpdateStatus().then((next) => { setStatus(next); setChannel(next.channel) }).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [api])

  if (api?.runtime !== 'electron') return null

  const check = async () => {
    if (!api.getDesktopUpdateStatus) {
      setError('This desktop build does not expose the update service.')
      return
    }
    setBusy('check')
    setError('')
    try {
      setStatus(await api.getDesktopUpdateStatus(channel))
      setChecked(true)
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
      await api.launchDesktopUpdate?.(channel)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy('')
    }
  }

  const selectChannel = async (nextChannel: DesktopUpdateChannel) => {
    if (nextChannel === channel || !api.getDesktopUpdateStatus) return
    setChannel(nextChannel)
    setBusy('check')
    setChecked(false)
    setError('')
    try {
      setStatus(await api.getDesktopUpdateStatus(nextChannel))
      setChecked(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy('')
    }
  }

  const label = !status?.helperInstalled ? 'Get LABO AI Setup' : status.updateAvailable ? 'Install update' : 'Open LABO AI Setup'
  const installedRef = status?.installedTag ?? (status?.currentVersion ? `v${status.currentVersion}` : '—')
  const upToDate = Boolean(status?.latestTag && status.latestTag === installedRef)
  return <article className="desktop-update-settings">
    <RefreshCw size={15} />
    <div>
      <strong>Desktop updates</strong>
      <p>Choose verified releases for normal use, or follow the newest commit when testing LABO AI development.</p>
      <div aria-label="Desktop update channel" className="desktop-update-channel">
        <button aria-pressed={channel === 'stable'} disabled={Boolean(busy)} onClick={() => void selectChannel('stable')} type="button"><ShieldCheck size={14} /><span><strong>Stable</strong><small>Recommended · published releases</small></span></button>
        <button aria-pressed={channel === 'main'} disabled={Boolean(busy)} onClick={() => void selectChannel('main')} type="button"><FlaskConical size={14} /><span><strong>Main</strong><small>Experimental · latest commit</small></span></button>
      </div>
      <dl className="desktop-update-facts">
        <div><dt>Installed</dt><dd>{installedRef}</dd></div>
        <div><dt>Latest available</dt><dd>{status?.latestTag ?? 'Not checked'}</dd></div>
      </dl>
      {checked && !error && !status?.error && <div className={`desktop-update-result ${status?.updateAvailable ? 'update-ready' : upToDate ? 'up-to-date' : 'update-unknown'}`}>
        {upToDate && <CheckCircle2 size={12} />}
        <span>{status?.updateAvailable ? `${status.latestTag} is ready to install.` : upToDate ? `You are up to date on ${installedRef}.` : 'Update check completed; the latest revision could not be confirmed.'}</span>
      </div>}
      {(error || status?.error) && <small>{error || status?.error}</small>}
      <div className="desktop-update-actions">
        <button disabled={Boolean(busy)} onClick={check} type="button"><RefreshCw size={12} />{busy === 'check' ? 'Checking…' : 'Check for updates'}</button>
        <button disabled={Boolean(busy) || !status} onClick={start} type="button"><Download size={12} />{busy === 'launch' ? 'Opening…' : label}</button>
      </div>
    </div>
  </article>
}
