import { describe, expect, it } from 'vitest'
import { desktopRevisionsMatch, desktopSetupReleaseUrl, desktopUpdateArguments, desktopUpdateHelperPath, desktopUpdateHelperPaths, desktopUpdateIsAvailable, getDesktopUpdateStatus, validDesktopUpdateChannel } from './desktop-updates'

describe('desktop source-first updates', () => {
  it('uses a private Electron profile helper path on every desktop platform', () => {
    expect(desktopUpdateHelperPath('/profile', 'darwin')).toBe('/profile/installer/labo-ai-setup')
    expect(desktopUpdateHelperPath('/profile', 'win32')).toBe('/profile/installer/labo-ai-setup.exe')
    expect(desktopUpdateHelperPath('/profile', 'linux')).toBe('/profile/installer/labo-ai-setup')
  })

  it('also discovers helpers installed by the legacy lowercase Setup profile', () => {
    expect(desktopUpdateHelperPaths('/profile/LABO AI', 'darwin', '/Users/judge')).toEqual([
      '/profile/LABO AI/installer/labo-ai-setup',
      '/Users/judge/Library/Application Support/labo-ai/installer/labo-ai-setup',
    ])
    expect(desktopUpdateHelperPaths('C:\\Users\\judge\\AppData\\Roaming\\LABO AI', 'win32', 'C:\\Users\\judge', 'C:\\Users\\judge\\AppData\\Roaming')).toEqual([
      'C:\\Users\\judge\\AppData\\Roaming\\LABO AI/installer/labo-ai-setup.exe',
      'C:\\Users\\judge\\AppData\\Roaming/labo-ai/installer/labo-ai-setup.exe',
    ])
  })

  it('uses the automatic-install argument understood by LABO AI Setup', () => {
    expect(desktopUpdateArguments('stable')).toEqual(['--auto-install', '--channel', 'stable'])
    expect(desktopUpdateArguments('main')).toEqual(['--auto-install', '--channel', 'main'])
    expect(validDesktopUpdateChannel('main')).toBe('main')
    expect(validDesktopUpdateChannel('unexpected')).toBe('stable')
  })

  it('recognizes the same installed revision across stable and main reference formats', () => {
    expect(desktopRevisionsMatch('v0.1.45', '0.1.45', 'stable')).toBe(true)
    expect(desktopRevisionsMatch('main@abcdef1', 'main@abcdef1234567890', 'main')).toBe(true)
    expect(desktopRevisionsMatch('main@abcdef1', 'main@1234567', 'main')).toBe(false)
  })

  it('treats switching channels as an explicit update even when each channel has its own reference format', () => {
    expect(desktopUpdateIsAvailable('v0.1.45', 'v0.1.45', 'stable', 'stable')).toBe(false)
    expect(desktopUpdateIsAvailable('v0.1.45', 'main@abcdef1', 'main', 'stable')).toBe(true)
    expect(desktopUpdateIsAvailable('main@abcdef1', 'v0.1.45', 'stable', 'main')).toBe(true)
    expect(desktopUpdateIsAvailable('v0.1.45', 'main@abcdef1', 'main', 'stable', 'abcdef1234567', 'abcdef1')).toBe(false)
  })

  it('sends a legacy desktop build to the latest Setup release', async () => {
    await expect(getDesktopUpdateStatus('/definitely/missing/labo-profile', '0.1.26', 'stable', 'darwin', '/definitely/missing/home')).resolves.toEqual({
      currentVersion: '0.1.26',
      channel: 'stable',
      helperInstalled: false,
      updateAvailable: false,
      setupUrl: desktopSetupReleaseUrl,
    })
  })
})
