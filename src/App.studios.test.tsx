// @vitest-environment jsdom

import './test/app-test-setup'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('LABO AI studios', () => {
  it('shows the source-first desktop updater in the shared settings', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getDesktopUpdateStatus: async () => ({
        currentVersion: '0.1.26',
        installedTag: 'v0.1.26',
        latestTag: 'v0.1.27',
        helperInstalled: true,
        updateAvailable: true,
        setupUrl: 'https://github.com/Complexity-ML/labo-ai/releases/latest',
      }),
    }
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Open LABO settings' }))

    expect(await screen.findByText('Desktop updates')).toBeInTheDocument()
    expect(screen.getByText('Installed v0.1.26 · latest v0.1.27. Updates are built locally from the tagged source.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Update and restart' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }))
    expect(await screen.findByText('v0.1.27 is ready to install.')).toBeInTheDocument()
    delete window.labo
  })

  it('opens Training Studio with real AdamW and Muon settings and PyTorch', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Training Studio' }))
  
    expect(screen.getByRole('button', { name: 'Use AdamW' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use Muon' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use Muon' }))
    expect(screen.getByRole('spinbutton', { name: 'Muon momentum' })).toHaveValue(0.95)
    expect(screen.getByRole('button', { name: 'Training graph' })).toHaveAttribute('aria-pressed', 'true')
  
    fireEvent.click(screen.getByRole('button', { name: 'PyTorch' }))
    expect(screen.getByText(/torch\.optim\.Muon\(model\.parameters\(\)/)).toBeInTheDocument()
    expect(screen.queryByText('training.optimizer')).not.toBeInTheDocument()
    expect(screen.getByText('optimizer.py')).toBeInTheDocument()
  
    fireEvent.click(screen.getByRole('button', { name: 'Training graph' }))
    expect(screen.getByText('training.optimizer')).toBeInTheDocument()
    expect(screen.queryByText('optimizer.py')).not.toBeInTheDocument()
  })
  
  it('creates a custom optimizer directly in Training Studio', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Training Studio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create optimizer' }))
  
    const dialog = screen.getByRole('dialog', { name: 'Create optimizer' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Optimizer name' }), { target: { value: 'Research AdamW' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Optimizer PyTorch class' }), { target: { value: 'AdamW' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Optimizer default settings' }), { target: { value: '{"lr": 0.0002, "weight_decay": 0.05, "fused": true}' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create optimizer' }))
  
    expect(screen.queryByRole('dialog', { name: 'Create optimizer' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use Research AdamW' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Research AdamW lr' })).toHaveValue(0.0002)
    expect(screen.getAllByText('torch.optim.AdamW').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'PyTorch' }))
    expect(screen.getByText(/optimizer = torch\.optim\.AdamW\(model\.parameters\(\), lr=0\.0002, weight_decay=0\.05, fused=True\)/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Training graph' }))
  
    fireEvent.click(screen.getByRole('button', { name: 'Edit optimizers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Research AdamW' }))
    const editor = screen.getByRole('dialog', { name: 'Edit optimizer' })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Optimizer name' }), { target: { value: 'Updated AdamW' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'Save optimizer' }))
    expect(screen.getByRole('button', { name: 'Edit Updated AdamW' })).toBeInTheDocument()
    fireEvent.contextMenu(screen.getByRole('article', { name: 'Optimizer card Updated AdamW' }))
    expect(screen.getByRole('menuitem', { name: 'Edit Updated AdamW' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete Updated AdamW' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit Updated AdamW' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Edit optimizer' })).getByRole('button', { name: 'Cancel' }))
  
    fireEvent.click(screen.getByRole('button', { name: 'Open LABO settings' }))
    expect(screen.getByRole('button', { name: 'Training Studio' })).toHaveAttribute('aria-pressed', 'true')
    const settings = screen.getByRole('dialog', { name: 'LABO AI settings' })
    expect(within(settings).getByRole('button', { name: 'General' })).toHaveAttribute('aria-pressed', 'true')
    for (const section of ['General', 'Workspaces', 'Agent', 'Application', 'Tips']) expect(within(settings).getByRole('button', { name: section })).toBeInTheDocument()
    fireEvent.click(within(settings).getByRole('button', { name: 'Application' }))
    expect(within(settings).getByText('One LABO AI workspace')).toBeInTheDocument()
    fireEvent.pointerDown(document.querySelector('.model-card-modal-backdrop')!)
    expect(screen.queryByRole('dialog', { name: 'LABO AI settings' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open LABO settings' }))
    const tokenizerSettings = screen.getByRole('dialog', { name: 'LABO AI settings' })
    for (const section of ['General', 'Workspaces', 'Agent', 'Application', 'Tips']) expect(within(tokenizerSettings).getByRole('button', { name: section })).toBeInTheDocument()
    fireEvent.click(within(tokenizerSettings).getByRole('button', { name: 'Application' }))
    expect(within(tokenizerSettings).getByText('One LABO AI workspace')).toBeInTheDocument()
  })
  
  it('keeps natural-language search inside the active studio', async () => {
    render(<App />)
  
    fireEvent.click(screen.getByRole('button', { name: 'Training Studio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search optimizers' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Natural language card search' }), { target: { value: 'muon momentum' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Search cards' })).getByRole('button', { name: /Muon/ }))
    expect(screen.getByRole('button', { name: 'Training Studio' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('spinbutton', { name: 'Muon momentum' })).toBeInTheDocument()
  
    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search tokenizer cards' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Natural language card search' }), { target: { value: 'video normalization' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Search cards' })).getByRole('button', { name: /Video normalization/ }))
    expect(screen.getByRole('button', { name: 'Tokenizer Studio' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('button', { name: 'Select Video normalization' })).toBeInTheDocument()
  })
  
  it('restores custom optimizers from the persistent desktop workspace database', async () => {
    const saveDesktopState = vi.fn(async () => ({ saved: true as const }))
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      loadDesktopState: async (scope) => scope === 'training' ? {
        config: { id: 'custom-persistent-muon-1', kind: 'custom-persistent-muon', settings: { lr: 0.002, momentum: 0.9 } },
        customOptimizers: [{ id: 'custom-persistent-muon', label: 'Persistent Muon', torchClass: 'Muon', defaults: { lr: 0.002, momentum: 0.9 } }],
        updatedAt: 1,
      } : undefined,
      saveDesktopState,
    }
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Training Studio' }))
  
    expect(await screen.findByRole('button', { name: 'Use Persistent Muon' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Persistent Muon lr' })).toHaveValue(0.002)
    await waitFor(() => expect(saveDesktopState).toHaveBeenCalledWith('training', expect.objectContaining({ customOptimizers: expect.arrayContaining([expect.objectContaining({ label: 'Persistent Muon' })]) })))
  })
  
  it('opens the atomic Tokenizer Studio and compiles its IR to Python', () => {
    render(<App />)
  
    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))
  
    expect(screen.getByLabelText('Tokenizer preset')).toHaveTextContent('Research BPE')
    expect(screen.getAllByText('Unicode normalization').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Byte-level pre-tokenizer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('BPE trainer').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Rust' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Split' }))
    expect(screen.getByText(/vocab_size=32768/)).toBeInTheDocument()
  
    fireEvent.click(screen.getByRole('button', { name: 'Select BPE trainer' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'vocabSize' }), { target: { value: '4096' } })
    expect(screen.getByText(/vocab_size=4096/)).toBeInTheDocument()
  
    fireEvent.click(screen.getByRole('button', { name: 'Select Unicode normalization' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected tokenizer atom' }))
    expect(screen.queryByText(/tokenizer\.normalizer/)).not.toBeInTheDocument()
    expect(screen.getByText(/^4 atoms/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play atomic pipeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Step one atom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop atomic pipeline' })).toBeInTheDocument()
  
    fireEvent.click(screen.getByRole('button', { name: 'o200k_base · OpenAI tiktoken' }))
    expect(screen.getByText(/tiktoken\.get_encoding\("o200k_base"\)/)).toBeInTheDocument()
    expect(screen.getByText('200,019')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /New reusable card/ }))
    expect(screen.getByRole('dialog', { name: 'Tokenizer card builder' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Python lowering' })).toBeInTheDocument()
    expect(screen.queryByText(/Rust lowering/)).not.toBeInTheDocument()
  })
  
  it('can delete every tokenizer step and add a real atom from the permanent library', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))
  
    for (const label of ['Unicode normalization', 'Byte-level pre-tokenizer', 'BPE model', 'BPE trainer', 'Byte-level decoder']) {
      fireEvent.click(screen.getByRole('button', { name: `Select ${label}` }))
      fireEvent.click(screen.getByRole('button', { name: 'Delete selected tokenizer atom' }))
    }
  
    expect(screen.getByText(/^0 atoms/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add BPE model' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add BPE model' }))
    expect(screen.getByRole('button', { name: 'Select BPE model' })).toBeInTheDocument()
    expect(screen.getByText(/^1 atoms/)).toBeInTheDocument()
  })
  
  it('edits and deletes a user tokenizer card from the library context menu', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))
    fireEvent.click(screen.getByRole('button', { name: /New reusable card/ }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Lowercase QA text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and add card' }))
  
    const libraryCard = screen.getByRole('button', { name: 'Add Lowercase QA text' })
    fireEvent.contextMenu(libraryCard)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit card' }))
    expect(screen.getByRole('dialog', { name: 'Tokenizer card builder' })).toHaveTextContent('Edit reusable tokenizer card')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  
    fireEvent.contextMenu(libraryCard)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete card' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Confirm delete' }))
    expect(screen.queryByRole('button', { name: 'Add Lowercase QA text' })).not.toBeInTheDocument()
  })
})
