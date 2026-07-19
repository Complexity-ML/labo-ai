import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

export interface DesktopUpdateStatus {
  currentVersion: string
  installedTag?: string
  latestTag?: string
  helperInstalled: boolean
  updateAvailable: boolean
  setupUrl: string
  error?: string
}

export const desktopSetupReleaseUrl = 'https://github.com/Complexity-ML/labo-ai/releases/latest'

export function desktopUpdateHelperPath(userData: string, platform = process.platform): string {
  return join(userData, 'installer', platform === 'win32' ? 'labo-ai-setup.exe' : 'labo-ai-setup')
}

async function helperExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function readHelperStatus(helper: string): Promise<{ installedTag?: string; latestTag?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, ['--status'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('LABO AI Setup status check timed out'))
    }, 15_000)
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code !== 0) return reject(new Error(stderr.trim() || `LABO AI Setup exited with ${code}`))
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch {
        reject(new Error('LABO AI Setup returned an invalid status'))
      }
    })
  })
}

export async function getDesktopUpdateStatus(userData: string, currentVersion: string, platform = process.platform): Promise<DesktopUpdateStatus> {
  const helper = desktopUpdateHelperPath(userData, platform)
  const installed = await helperExists(helper)
  if (!installed) {
    return { currentVersion, helperInstalled: false, updateAvailable: false, setupUrl: desktopSetupReleaseUrl }
  }
  try {
    const status = await readHelperStatus(helper)
    return {
      currentVersion,
      installedTag: status.installedTag,
      latestTag: status.latestTag,
      helperInstalled: true,
      updateAvailable: Boolean(status.latestTag && status.latestTag !== `v${currentVersion}`),
      setupUrl: desktopSetupReleaseUrl,
    }
  } catch (error) {
    return {
      currentVersion,
      helperInstalled: true,
      updateAvailable: false,
      setupUrl: desktopSetupReleaseUrl,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function launchDesktopUpdate(userData: string, platform = process.platform): Promise<{ launched: true }> {
  const helper = desktopUpdateHelperPath(userData, platform)
  if (!(await helperExists(helper))) throw new Error('LABO AI Setup is not installed yet')
  const child = spawn(helper, ['--update', '--parent-pid', String(process.pid)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  })
  child.unref()
  return { launched: true }
}
