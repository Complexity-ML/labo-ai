import { describe, expect, it } from 'vitest'
import { desktopSetupReleaseUrl, desktopUpdateArguments, desktopUpdateHelperPath, desktopUpdateHelperPaths, getDesktopUpdateStatus } from './desktop-updates'

describe('desktop source-first updates', () => {
  it('uses a private Electron profile helper path on macOS and Windows', () => {
    expect(desktopUpdateHelperPath('/profile', 'darwin')).toBe('/profile/installer/labo-ai-setup')
    expect(desktopUpdateHelperPath('/profile', 'win32')).toBe('/profile/installer/labo-ai-setup.exe')
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
    expect(desktopUpdateArguments).toEqual(['--auto-install'])
  })

  it('sends a legacy desktop build to the latest Setup release', async () => {
    await expect(getDesktopUpdateStatus('/definitely/missing/labo-profile', '0.1.26', 'darwin', '/definitely/missing/home')).resolves.toEqual({
      currentVersion: '0.1.26',
      helperInstalled: false,
      updateAvailable: false,
      setupUrl: desktopSetupReleaseUrl,
    })
  })
})
