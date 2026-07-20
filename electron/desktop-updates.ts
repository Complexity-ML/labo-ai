import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface DesktopUpdateStatus {
  currentVersion: string
  channel: DesktopUpdateChannel
  installedTag?: string
  latestTag?: string
  helperInstalled: boolean
  updateAvailable: boolean
  setupUrl: string
  error?: string
}

export type DesktopUpdateChannel = 'stable' | 'main'

export const desktopSetupReleaseUrl = 'https://github.com/Complexity-ML/labo-ai/releases/latest'
export const desktopUpdateArguments = (channel: DesktopUpdateChannel) => ['--auto-install', '--channel', channel] as const

export function validDesktopUpdateChannel(value: unknown): DesktopUpdateChannel {
  return value === 'main' ? 'main' : 'stable'
}

export function desktopUpdateHelperPath(userData: string, platform = process.platform): string {
  return join(userData, 'installer', platform === 'win32' ? 'labo-ai-setup.exe' : 'labo-ai-setup')
}

export function desktopUpdateHelperPaths(userData: string, platform = process.platform, home = homedir(), appData = process.env.APPDATA): string[] {
  const filename = platform === 'win32' ? 'labo-ai-setup.exe' : 'labo-ai-setup'
  const primary = desktopUpdateHelperPath(userData, platform)
  const legacyRoot = platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'labo-ai')
    : platform === 'win32'
      ? join(appData || join(home, 'AppData', 'Roaming'), 'labo-ai')
      : userData
  return [...new Set([primary, join(legacyRoot, 'installer', filename)])]
}

async function helperExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function findDesktopUpdateHelper(userData: string, platform = process.platform, home = homedir(), appData = process.env.APPDATA): Promise<string | undefined> {
  for (const candidate of desktopUpdateHelperPaths(userData, platform, home, appData)) if (await helperExists(candidate)) return candidate
  return undefined
}

function readHelperStatus(helper: string, channel: DesktopUpdateChannel, platform = process.platform): Promise<{ installedTag?: string; latestTag?: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(helper, ['--status', '--channel', channel], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(platform === 'linux' ? { env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } } : {}),
    })
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
        const parsed = JSON.parse(stdout.trim()) as { installedTag?: unknown; latestTag?: unknown }
        resolve({
          ...(typeof parsed.installedTag === 'string' ? { installedTag: parsed.installedTag } : {}),
          ...(typeof parsed.latestTag === 'string' ? { latestTag: parsed.latestTag } : {}),
        })
      } catch {
        reject(new Error('LABO AI Setup returned an invalid status'))
      }
    })
  })
}

export async function getDesktopUpdateStatus(userData: string, currentVersion: string, channel: DesktopUpdateChannel = 'stable', platform = process.platform, home = homedir(), appData = process.env.APPDATA): Promise<DesktopUpdateStatus> {
  const helper = await findDesktopUpdateHelper(userData, platform, home, appData)
  if (!helper) {
    return { currentVersion, channel, helperInstalled: false, updateAvailable: false, setupUrl: desktopSetupReleaseUrl }
  }
  try {
    const status = await readHelperStatus(helper, channel, platform)
    const installedRef = status.installedTag ?? (channel === 'stable' ? `v${currentVersion}` : undefined)
    return {
      currentVersion,
      channel,
      installedTag: status.installedTag,
      latestTag: status.latestTag,
      helperInstalled: true,
      updateAvailable: Boolean(status.latestTag && status.latestTag !== installedRef),
      setupUrl: desktopSetupReleaseUrl,
    }
  } catch (error) {
    return {
      currentVersion,
      channel,
      helperInstalled: true,
      updateAvailable: false,
      setupUrl: desktopSetupReleaseUrl,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function launchDesktopUpdate(userData: string, channel: DesktopUpdateChannel = 'stable', platform = process.platform): Promise<{ launched: true }> {
  const helper = await findDesktopUpdateHelper(userData, platform)
  if (!helper) throw new Error('LABO AI Setup is not installed yet')
  const child = spawn(helper, [...desktopUpdateArguments(channel)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    ...(platform === 'linux' ? { env: { ...process.env, APPIMAGE_EXTRACT_AND_RUN: '1' } } : {}),
  })
  child.unref()
  return { launched: true }
}
