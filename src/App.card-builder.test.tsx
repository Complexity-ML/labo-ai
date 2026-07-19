// @vitest-environment jsdom

import './test/app-test-setup'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('LABO AI card builder', () => {
  it('keeps card editing distinct from Blockly adding and uses the central modal', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
  
    expect(screen.getByRole('button', { name: 'Add Token IDs' })).toBeDisabled()
    expect(screen.getAllByLabelText(/Editable card:/).length).toBeGreaterThan(10)
    expect(screen.getAllByLabelText('Editable card: settings').length).toBeGreaterThan(5)
    fireEvent.click(screen.getByRole('button', { name: 'Select Tied token embedding' }))
    expect(screen.getByRole('dialog', { name: 'Edit model card' })).toBeInTheDocument()
    expect(screen.getByText(/No new Blockly card is added in this mode/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Tied token embedding vocabSize' })).not.toBeInTheDocument()
  })
  
  it('opens the central card editor on double-click without switching modes first', () => {
    render(<App />)
    const card = screen.getByRole('button', { name: 'Select Tied token embedding' })
  
    fireEvent.pointerDown(card, { detail: 2, pointerId: 1 })
    fireEvent.doubleClick(card)
  
    expect(screen.getByRole('dialog', { name: 'Edit model card' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Model card name' })).toHaveValue('Tied token embedding')
  })
  
  it('creates a reusable custom PyTorch card and keeps its code editable', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Split' }))
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    expect(screen.queryByRole('textbox', { name: 'Custom card name' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    expect(await screen.findByRole('dialog', { name: 'Create model card' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Card destination' })).toHaveValue('new-architecture')
    expect(screen.getByRole('option', { name: /After selected card/ })).toBeDisabled()
    fireEvent.click(screen.getByText('Advanced settings'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card name' }), { target: { value: 'My RMSNorm' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card PyTorch code' }), { target: { value: 'nn.RMSNorm(768)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create as new architecture' }))
  
    expect(screen.getByRole('button', { name: 'Add My RMSNorm' })).toHaveAttribute('draggable', 'true')
    expect(screen.getByRole('button', { name: 'Select My RMSNorm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Select My RMSNorm' }))
    expect(screen.getByRole('dialog', { name: 'Edit model card' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Model card PyTorch module' })).toHaveValue('nn.RMSNorm(768)')
    expect(screen.getByText('Valid safe nn.Module constructor')).toBeInTheDocument()
    const code = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(code).toContain('kind=custom-pytorch')
    expect(code).toContain('self.custom_my_rmsnorm = nn.RMSNorm(768)')
  
    fireEvent.change(screen.getByRole('textbox', { name: 'Model card PyTorch module' }), { target: { value: 'torch.load("unsafe.pt")' } })
    expect(screen.getByText('Invalid or unsupported nn.Module constructor')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByRole('alert')).toHaveTextContent('safe nn.Module')
    expect((screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value).not.toContain('class GeneratedInvalidGraph')
    expect(JSON.parse(window.localStorage.getItem('labo.custom-pytorch-cards.v1') ?? '[]')).toEqual([
      { id: 'my-rmsnorm', label: 'My RMSNorm', code: 'nn.RMSNorm(768)' },
    ])
  })
  
  it('closes the Card Builder when its backdrop is clicked', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create model card' })
  
    fireEvent.pointerDown(dialog.parentElement!)
  
    expect(screen.queryByRole('dialog', { name: 'Create model card' })).not.toBeInTheDocument()
  })
  
  it('can save a reusable card to the library without mutating the graph', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    await screen.findByRole('dialog', { name: 'Create model card' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Card destination' }), { target: { value: 'library' } })
    fireEvent.click(screen.getByText('Advanced settings'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card name' }), { target: { value: 'Library RMSNorm' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card PyTorch code' }), { target: { value: 'nn.RMSNorm(768)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to My cards' }))
  
    expect(screen.getByRole('button', { name: 'Add Library RMSNorm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Library RMSNorm' })).not.toBeInTheDocument()
    expect(screen.getByText('0 atoms')).toBeInTheDocument()
  })
  
  it('auto-composes category-specific Blockly card construction blocks', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    await screen.findByRole('dialog', { name: 'Create model card' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card need' }), { target: { value: 'Use a SiLU activation for the expert branch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Compose card' }))
  
    expect(screen.getByLabelText('Card construction blocks')).toHaveTextContent('SiLU')
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(screen.getByRole('textbox', { name: 'Custom card PyTorch code' })).toHaveValue('nn.SiLU()')
    expect((screen.getByRole('textbox', { name: 'Custom card name' }) as HTMLInputElement).value).toMatch(/^Use a SiLU activation/)
    expect(screen.queryByText('Create PyTorch card')).not.toBeInTheDocument()
  })
  
  it('prompts Ask LABO directly from the Card Builder without mutating the graph', async () => {
    const askLabo = vi.fn(async () => ({
      summary: 'One reusable card.', addedBlocks: [],
      createdBlocks: [{ nodeId: 'builder-gelu', label: 'Expert GELU', pytorchModule: 'nn.GELU()', inputRole: 'hidden' as const, outputRole: 'hidden' as const, reason: 'Requested in Card Builder.' }],
      connections: [], missingBlocks: [], warnings: [],
    }))
    window.labo = { platform: 'web', runtime: 'web', askLabo }
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    await screen.findByRole('dialog', { name: 'Create model card' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card need' }), { target: { value: 'Create a GELU expert activation' } })
    fireEvent.click(screen.getByRole('button', { name: 'Compose card' }))
  
    await waitFor(() => expect(screen.getByLabelText('Card construction blocks')).toHaveTextContent('GELU'))
    fireEvent.click(screen.getByText('Advanced settings'))
    expect(screen.getByRole('textbox', { name: 'Custom card PyTorch code' })).toHaveValue('nn.GELU()')
    expect(screen.getByRole('textbox', { name: 'Custom card name' })).toHaveValue('Expert GELU')
    expect(askLabo).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ cardBuilderMode: true }) }))
    expect(screen.queryByRole('button', { name: 'Select Expert GELU' })).not.toBeInTheDocument()
  })
  
  it('changes the available card blocks and plugs with the selected category', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    await screen.findByRole('dialog', { name: 'Create model card' })
    fireEvent.click(screen.getByText('Advanced settings'))
    const palette = screen.getByLabelText('Card operation palette')
  
    expect(within(palette).getByRole('button', { name: 'Linear' })).toBeInTheDocument()
    expect(within(palette).queryByRole('button', { name: 'Dropout' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Custom card category' }), { target: { value: 'normalization' } })
    expect(within(palette).getAllByRole('button').map((button) => button.textContent)).toEqual(['RMSNorm', 'LayerNorm'])
    expect(screen.getByRole('textbox', { name: 'Custom card PyTorch code' })).toHaveValue('nn.RMSNorm(768)')
    expect(screen.getByRole('combobox', { name: 'Custom card output type' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: 'Custom card category' }), { target: { value: 'utility' } })
    expect(within(palette).getAllByRole('button').map((button) => button.textContent)).toEqual(['Identity'])
    expect(screen.getByRole('textbox', { name: 'Custom card PyTorch code' })).toHaveValue('nn.Identity()')
  })
  
  it('exports the Blockly diagram or generated PyTorch through the desktop save bridge', async () => {
    const exportFile = vi.fn(async (_payload: { filename: string; content: string; kind: 'svg' | 'python' }) => ({ saved: true }))
    window.labo = { platform: 'darwin', runtime: 'electron', runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }), exportFile }
    render(<App />)
  
    fireEvent.click(screen.getByLabelText('Export architecture'))
    fireEvent.click(screen.getByRole('button', { name: /Diagram SVG/ }))
    await waitFor(() => expect(exportFile).toHaveBeenCalledOnce())
    expect(exportFile.mock.calls[0]![0]).toMatchObject({ filename: 'tr-300m.svg', kind: 'svg' })
    expect(exportFile.mock.calls[0]![0].content).toContain('<svg')
    delete window.labo
  })
  
  it('exposes the supervised objective that consumes the Training Labels Y plug', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Training Labels' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Cross-entropy loss' }))
  
    expect(document.querySelector('[data-port-id="labels-labels-output"]')).toHaveAttribute('data-port-role', 'labels')
    expect(document.querySelector('[data-port-id="cross-entropy-loss-1-labels-input"]')).toHaveAttribute('data-port-role', 'labels')
    expect(document.querySelector('[data-port-id="cross-entropy-loss-1-logits-input"]')).toHaveAttribute('data-port-role', 'logits')
  })
  
  it('offers an explicit tied language-model head Blockly card', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Split' }))
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByText(/Tied output head/))
    const card = screen.getByRole('button', { name: 'Add Tied language-model head' })
    expect(card).toHaveAttribute('draggable', 'true')
    fireEvent.click(card)
  
    expect(screen.getByRole('button', { name: 'Select Tied language-model head' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Select Tied language-model head' }))
    expect(screen.getByRole('checkbox', { name: 'Model card setting tieEmbeddingWeights' })).toBeChecked()
    expect((screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value).toContain('# labo:node=lm-head-1 atom=lm-head')
    expect(screen.getByText('Atomic PyTorch draft')).toBeInTheDocument()
  })
})
