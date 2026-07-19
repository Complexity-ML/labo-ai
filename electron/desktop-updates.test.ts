import { describe, expect, it } from 'vitest'
import { desktopSetupReleaseUrl, desktopUpdateHelperPath, getDesktopUpdateStatus } from './desktop-updates'

describe('desktop source-first updates', () => {
  it('uses a private Electron profile helper path on macOS and Windows', () => {
    expect(desktopUpdateHelperPath('/profile', 'darwin')).toBe('/profile/installer/labo-ai-setup')
    expect(desktopUpdateHelperPath('/profile', 'win32')).toBe('/profile/installer/labo-ai-setup.exe')
  })

  it('sends a legacy desktop build to the latest Setup release', async () => {
    await expect(getDesktopUpdateStatus('/definitely/missing/labo-profile', '0.1.26', 'darwin')).resolves.toEqual({
      currentVersion: '0.1.26',
      helperInstalled: false,
      updateAvailable: false,
      setupUrl: desktopSetupReleaseUrl,
    })
  })
})
