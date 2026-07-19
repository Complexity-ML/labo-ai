import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDesktopState, saveDesktopState } from './desktop-state'

let directory = ''

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = ''
})

describe('desktop SQLite workspace state', () => {
  it('keeps independent model, training and tokenizer records across database reopen', async () => {
    directory = await mkdtemp(join(tmpdir(), 'labo-ai-state-'))
    await saveDesktopState(directory, 'model', { preset: 'my-model', nodes: 12 })
    await saveDesktopState(directory, 'training', { optimizer: 'my-muon' })

    expect(await loadDesktopState(directory, 'model')).toEqual({ preset: 'my-model', nodes: 12 })
    expect(await loadDesktopState(directory, 'training')).toEqual({ optimizer: 'my-muon' })
    expect(await loadDesktopState(directory, 'tokenizer')).toBeUndefined()
  })

  it('rejects unknown state scopes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'labo-ai-state-'))
    await expect(saveDesktopState(directory, 'secret', {})).rejects.toThrow('Invalid LABO desktop state scope')
  })
})
