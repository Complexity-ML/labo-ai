// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { blankStarterPreset } from './core/presets'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  delete window.labo
})

describe('LABO AI workspace', () => {
  it('reserves the native macOS titlebar area only inside Electron', () => {
    window.labo = { platform: 'darwin', runtime: 'electron', runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }) }

    render(<App />)

    expect(document.querySelector('.app-shell')).toHaveClass('runtime-electron')
    delete window.labo
  })

  it('removes the macOS traffic-light offset in native fullscreen', async () => {
    let publish: ((state: { fullScreen: boolean }) => void) | undefined
    window.labo = {
      platform: 'darwin', runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getWindowState: async () => ({ fullScreen: false }),
      onWindowStateChange: (callback) => { publish = callback; return () => undefined },
    }

    render(<App />)
    await waitFor(() => expect(publish).toBeTypeOf('function'))
    publish?.({ fullScreen: true })

    await waitFor(() => expect(document.querySelector('.app-shell')).toHaveClass('native-fullscreen'))
    delete window.labo
  })

  it('uses native Windows chrome and Windows keyboard labels', () => {
    window.labo = { platform: 'win32', runtime: 'electron', runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }) }

    render(<App />)

    expect(document.querySelector('.app-shell')).toHaveClass('runtime-electron', 'runtime-win32')
    expect(document.querySelector('.app-shell')).not.toHaveClass('runtime-darwin')
    expect(screen.getByRole('button', { name: 'Search model cards' })).toHaveTextContent('Ctrl+K')
    delete window.labo
  })

  it('disables native PyTorch execution in a browser renderer', () => {
    delete window.labo
    render(<App />)

    expect(screen.getByRole('button', { name: 'Play model atoms' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Step one model atom' })).toBeDisabled()
    expect(screen.getByText('desktop only')).toBeInTheDocument()
  })

  it('keeps an authenticated web workspace on the user-scoped server without browser storage', async () => {
    const saveWebWorkspace = vi.fn(async () => ({ saved: true as const, updatedAt: Date.now() }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    window.labo = {
      platform: 'web',
      runtime: 'web',
      loadWebWorkspace: async () => ({ authenticated: true, workspace: null, customCards: [] }),
      saveWebWorkspace,
    }

    render(<App />)
    fireEvent.click(screen.getByText('My workspaces'))
    fireEvent.click(screen.getByRole('button', { name: 'Create and open a blank workspace' }))

    await waitFor(() => expect(saveWebWorkspace).toHaveBeenCalled(), { timeout: 2_000 })
    expect(setItem).not.toHaveBeenCalled()
    delete window.labo
    setItem.mockRestore()
  })

  it('keeps a guest web workspace ephemeral', async () => {
    const saveWebWorkspace = vi.fn(async () => ({ saved: true as const, updatedAt: Date.now() }))
    window.labo = {
      platform: 'web',
      runtime: 'web',
      loadWebWorkspace: async () => ({ authenticated: false, workspace: null, customCards: [] }),
      saveWebWorkspace,
    }

    render(<App />)
    fireEvent.click(screen.getByText('My workspaces'))
    fireEvent.click(screen.getByRole('button', { name: 'Create and open a blank workspace' }))
    await new Promise((resolve) => setTimeout(resolve, 850))

    expect(saveWebWorkspace).not.toHaveBeenCalled()
    delete window.labo
  })

  it('never lets a late web restore delete a card added from search', async () => {
    let resolveWorkspace: ((value: { authenticated: boolean; workspace: unknown; customCards: unknown[] }) => void) | undefined
    window.labo = {
      platform: 'web', runtime: 'web',
      loadWebWorkspace: () => new Promise((resolve) => { resolveWorkspace = resolve }),
      saveWebWorkspace: async () => ({ saved: true, updatedAt: Date.now() }),
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Search model cards' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Natural language card search' }), { target: { value: 'decode generated logits token' } })
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Search cards' })).getByRole('button', { name: /^Greedy token decoder/ }))
    expect(screen.getByRole('button', { name: 'Select Greedy token decoder' })).toBeInTheDocument()

    resolveWorkspace?.({
      authenticated: true,
      workspace: { activePresetId: blankStarterPreset.id, drafts: { [blankStarterPreset.id]: { graph: blankStarterPreset, selectedNodeId: '' } }, userPresets: [], updatedAt: 1 },
      customCards: [],
    })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Select Greedy token decoder' })).toBeInTheDocument())
    delete window.labo
  })

  it('shows the canonical TR 300M GQA-attention and deterministic routed-MLP workspace', () => {
    render(<App />)

    expect(screen.getByText('LABO AI')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blocks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PyTorch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true')
    for (const label of ['Tied token embedding', 'GQA QKV projection', '16 Q / 4 KV heads', 'QK-Norm', 'Causal SDPA / Flash', 'Fixed lexical top-2 lookup', 'Shared dense SwiGLU', '4 × routed SwiGLU']) {
      expect(screen.getByRole('button', { name: `Select ${label}` })).not.toHaveAttribute('draggable')
    }
    expect(document.querySelectorAll('[data-edge-id]')).toHaveLength(31)
    expect(document.querySelector('[data-port-id="qkv-q-output"]')).toHaveAttribute('data-port-role', 'query')
    expect(document.querySelector('[data-port-id="sdpa-output-output"]')).toHaveAttribute('data-port-role', 'attention')
    expect(document.querySelector('[data-port-id="fixed-routes-expertIndices-output"]')).toHaveAttribute('data-port-role', 'expert-indices')
    expect(document.querySelector('[data-port-id="routed-expertWeights-input"]')).toHaveAttribute('data-port-role', 'routing-weights')
    const pytorch = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(pytorch).toContain('class GeneratedModel')
    expect(pytorch).toContain('self.embedding = nn.Embedding(32000, 1024)')
    expect(pytorch).toContain('# labo:edge=rope-q-sdpa source=rope target=sdpa')
    expect(pytorch).toContain('self.head.weight = self.embedding.weight')
    expect(document.querySelector('.python-syntax-layer')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.python-token.keyword')).toHaveTextContent('import')
    expect(document.querySelector('.python-token.class-name')).toHaveTextContent('GeneratedModel')
    expect(screen.queryByRole('button', { name: 'Run checks' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play model atoms' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Step one model atom' })).toBeInTheDocument()
    expect(screen.getByText('20 atoms')).toBeInTheDocument()
    expect(screen.getByText('PyTorch graph executable')).toBeInTheDocument()
    expect(screen.queryByText('368.64K params')).not.toBeInTheDocument()
    expect(screen.queryByText('98.18M params')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Learned Hidden-State Router' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Top-K Routing' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Routed Residual Experts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Shared Dense Expert' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add DeepSeek-style MoE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dispatch|gather|scatter/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/Activations/))
    expect(screen.getByRole('button', { name: 'Add ReLU' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add GELU' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add SiLU / Swish' })).toBeInTheDocument()
  })

  it('exposes the 100+ native card catalog by useful atomic families', () => {
    render(<App />)

    for (const family of ['Normalization variants', 'Attention variants', 'Position variants', 'Composition variants', 'MLP variants', 'Output variants']) {
      fireEvent.click(screen.getByText(new RegExp(family)))
    }
    for (const card of ['ScaleNorm', 'Bidirectional SDPA', 'Sinusoidal position encoding', 'Learned gated blend', 'Squared-ReLU MLP', 'Softmax output']) {
      expect(screen.getByRole('button', { name: `Add ${card}` })).toBeInTheDocument()
    }
  })

  it('offers executable vision, image-editing, and video starters with their own card family', () => {
    render(<App />)

    fireEvent.click(screen.getByText('Specialized variants'))
    fireEvent.click(screen.getByText('Image, video & multimodal'))
    expect(screen.getByRole('button', { name: 'Add Vision patch projection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Adaptive multimodal conditioning' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Temporal depthwise convolution' })).toBeInTheDocument()

    fireEvent.click(document.querySelector('.preset-menu > summary')!)
    for (const preset of ['Vision', 'Image edit', 'Video']) expect(screen.getByRole('button', { name: preset })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Image edit' }))
    expect(screen.getByRole('button', { name: 'Select Adaptive text-image conditioning' })).toBeInTheDocument()
    expect(screen.getByText('16 atoms')).toBeInTheDocument()
  })

  it('switches to a focused TR Basic module graph without changing the full TR 300M preset', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'TR Basic' }))

    for (const label of ['Token IDs', 'Contextual hidden state', 'Fixed Token-ID Router', 'Shared Dense Expert', '4 × Routed Residual Experts', 'Shared + Routed Merge']) {
      expect(screen.getByRole('button', { name: `Select ${label}` })).toBeInTheDocument()
    }
    expect(screen.getByText('6 atoms')).toBeInTheDocument()
    expect(screen.getByText(/6 nodes · 7 links/)).toBeInTheDocument()
    const trCode = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(trCode).toContain('def forward(self, token_ids: torch.Tensor, hidden_states: torch.Tensor):')
    expect(trCode).not.toContain('atom=moe-router')

    fireEvent.click(screen.getByRole('button', { name: 'TR 300M' }))
    expect(screen.getByRole('button', { name: 'Select GQA QKV projection' })).toBeInTheDocument()
    expect(screen.getByText('20 atoms')).toBeInTheDocument()
  })

  it('offers a blank starter and focused architecture presets without a static contracts panel', () => {
    render(<App />)

    expect(screen.queryByText('Architecture contracts')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    expect(screen.getByText('Blank canvas ready')).toBeInTheDocument()
    expect(screen.getByText('0 atoms')).toBeInTheDocument()
    expect(screen.getByText(/0 nodes · 0 links/)).toBeInTheDocument()
    expect(screen.getByText('Neural IR blank')).toBeInTheDocument()
    expect(screen.getByText(/Add an atomic block from the library/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play model atoms' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Model generation prompt' })).toBeInTheDocument()
    expect(screen.getByLabelText('Model generation output')).toHaveTextContent('waiting for blocks')

    fireEvent.click(screen.getByRole('button', { name: 'Learned MoE' }))
    expect(screen.getByRole('button', { name: 'Select Learned Hidden-State Router' })).toBeInTheDocument()
    expect(screen.getByText('9 atoms')).toBeInTheDocument()
  })

  it('loads an executable dense GPT-like starter', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'GPT-like' }))

    for (const label of ['Tied token embedding', '12-head QKV projection', 'Causal self-attention', 'Dense SwiGLU MLP', 'Tied language-model head']) {
      expect(screen.getByRole('button', { name: `Select ${label}` })).toBeInTheDocument()
    }
    expect(screen.getByText('15 atoms')).toBeInTheDocument()
    expect(screen.getByText('PyTorch graph executable')).toBeInTheDocument()
    const code = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(code).toContain('F.scaled_dot_product_attention')
    expect(code).toContain('self.mlp_gate = nn.Linear(768, 3072, bias=False)')
    expect(code).toContain('self.head.weight = self.embedding.weight')
  })

  it('keeps the prompt and output module on every built-in model starter', () => {
    render(<App />)

    for (const preset of ['Blank starter', 'GPT-like', 'TR Basic', 'Learned MoE', 'TR 300M']) {
      fireEvent.click(screen.getByRole('button', { name: preset }))
      expect(screen.getByRole('textbox', { name: 'Model generation prompt' })).toBeInTheDocument()
      expect(screen.getByLabelText('Model generation output')).toBeInTheDocument()
    }
  })

  it('adds graph input cards from the Blockly library to a blank model', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))

    for (const label of ['Token IDs', 'Hidden State', 'Training Labels']) {
      expect(screen.getByRole('button', { name: `Add ${label}` })).toHaveAttribute('draggable', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Add Token IDs' }))

    expect(screen.getByRole('button', { name: 'Select Token IDs' })).toBeInTheDocument()
    expect(document.querySelector('[data-port-id="token-ids-tokenIds-output"]')).toHaveAttribute('data-port-role', 'token-ids')
    expect(screen.getByText('Research BPE')).toBeInTheDocument()
    expect(screen.getByText('Atomic PyTorch draft')).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value).toContain('return token_ids')
  })

  it('searches native cards with natural language and adds the selected result', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Search model cards' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Natural language card search' }), { target: { value: 'convertir logits en token généré' } })

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Search cards' })).getByRole('button', { name: /Greedy token decoder/ }))
    expect(screen.queryByRole('dialog', { name: 'Search cards' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Greedy token decoder' })).toBeInTheDocument()
  })

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

  it('creates a reusable custom PyTorch card and keeps its code editable', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    expect(screen.queryByRole('textbox', { name: 'Custom card name' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    expect(screen.getByRole('dialog', { name: 'Create model card' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Card destination' })).toHaveTextContent('The reusable definition is always saved in My cards.')
    expect(screen.getByRole('button', { name: /After selected card/ })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card name' }), { target: { value: 'My RMSNorm' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card PyTorch code' }), { target: { value: 'nn.RMSNorm(768)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create as new architecture' }))

    expect(screen.getByRole('button', { name: 'Add My RMSNorm' })).toHaveAttribute('draggable', 'true')
    expect(screen.getByRole('button', { name: 'Select My RMSNorm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select My RMSNorm' }))
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

  it('can save a reusable card to the library without mutating the graph', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    fireEvent.click(screen.getByRole('button', { name: /Library only/ }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card name' }), { target: { value: 'Library RMSNorm' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card PyTorch code' }), { target: { value: 'nn.RMSNorm(768)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save to My cards' }))

    expect(screen.getByRole('button', { name: 'Add Library RMSNorm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Library RMSNorm' })).not.toBeInTheDocument()
    expect(screen.getByText('0 atoms')).toBeInTheDocument()
  })

  it('auto-composes category-specific Blockly card construction blocks', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Custom card category' }), { target: { value: 'activation' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Custom card need' }), { target: { value: 'Use a SiLU activation for the expert branch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-compose blocks' }))

    expect(screen.getByRole('textbox', { name: 'Custom card PyTorch code' })).toHaveValue('nn.SiLU()')
    expect((screen.getByRole('textbox', { name: 'Custom card name' }) as HTMLInputElement).value).toMatch(/^Use a SiLU activation/)
    expect(screen.getByLabelText('Card construction blocks')).toHaveTextContent('SiLU')
    expect(screen.queryByText('Create PyTorch card')).not.toBeInTheDocument()
  })

  it('changes the available card blocks and plugs with the selected category', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'New reusable card' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByText(/Output variants/))
    const card = screen.getByRole('button', { name: 'Add Tied language-model head' })
    expect(card).toHaveAttribute('draggable', 'true')
    fireEvent.click(card)

    expect(screen.getByRole('button', { name: 'Select Tied language-model head' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Tied language-model head' }))
    expect(screen.getByRole('checkbox', { name: 'Model card setting tieEmbeddingWeights' })).toBeChecked()
    expect((screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value).toContain('# labo:node=lm-head-1 atom=lm-head')
    expect(screen.getByText('Atomic PyTorch draft')).toBeInTheDocument()
  })

  it('preserves each preset draft while switching between model starters', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Token IDs' }))
    expect(screen.getByText('1 atoms')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'GPT-like' }))
    expect(screen.getByText('15 atoms')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))

    expect(screen.getByText('1 atoms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Token IDs' })).toBeInTheDocument()
    expect(document.querySelector('[data-port-id="token-ids-tokenIds-output"]')).toBeInTheDocument()
  })

  it('restores the active graph after the editor is closed and reopened', () => {
    const first = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Token IDs' }))
    expect(screen.getByText('1 atoms')).toBeInTheDocument()

    first.unmount()
    render(<App />)

    expect(screen.getByText('1 atoms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Token IDs' })).toBeInTheDocument()
  })

  it('creates a named user preset and restores its evolving draft', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Token IDs' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New model preset name' }), { target: { value: 'My routed model' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save a named copy of Blank starter' }))
    fireEvent.click(screen.getByText(/Activations/))
    fireEvent.click(screen.getByRole('button', { name: 'Add ReLU' }))
    expect(screen.getByText('2 atoms')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'GPT-like' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load preset My routed model' }))

    expect(screen.getByText('2 atoms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select ReLU' })).toBeInTheDocument()
  })

  it('creates independent blank workspaces, mixes presets, and clears one architecture in edit mode', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Create and open a blank workspace' }))
    expect(screen.getByText('0 atoms')).toBeInTheDocument()
    expect(screen.getAllByText('Blank canvas 1').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Add GPT-like beside current graph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add TR Basic beside current graph' }))
    expect(screen.getByText('21 atoms')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'PyTorch architecture' })).toHaveTextContent('GPT-like Starter')
    expect(screen.getByRole('combobox', { name: 'PyTorch architecture' })).toHaveTextContent('TR Basic · Shared + Residual Top-2')

    const clear = screen.getByRole('button', { name: 'Clear architecture TR Basic · Shared + Residual Top-2' })
    expect(clear).toHaveTextContent('6 cards')
    expect(document.querySelectorAll('.architecture-node.architecture-target')).toHaveLength(6)
    fireEvent.click(clear)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm clearing TR Basic · Shared + Residual Top-2' }))
    expect(screen.getByText('15 atoms')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Shared Dense Expert' })).not.toBeInTheDocument()
  })

  it('tokenizes a real prompt before running the GPT-like graph', async () => {
    const runAtomic = vi.fn(async (payload: { kind: 'model'; graph: unknown; tokenIds?: number[] } | { kind: 'tokenizer'; pipeline: unknown; sample?: string }) => {
      if (payload.kind === 'tokenizer') {
        return { engine: 'tokenizers' as const, status: 'completed' as const, tokenIds: [4, 8, 15, 16, 23, 42], results: [] }
      }
      const nodes = (payload.graph as { nodes: { id: string }[] }).nodes
      return {
        engine: 'pytorch' as const,
        status: 'completed' as const,
        modelOutput: { kind: 'logits' as const, tensorShape: [1, 6, 32000], logitsShape: [1, 6, 32000], predictedTokenId: 42, topTokenIds: [42, 23, 16, 15, 8], topProbabilities: [0.4, 0.25, 0.15, 0.12, 0.08] },
        results: nodes.map((node) => ({ atomId: node.id, status: 'passed' as const, summary: `${node.id} ok` })),
      }
    })
    window.labo = { platform: 'darwin', runtime: 'electron', runAtomic }
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'GPT-like' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Model generation prompt' }), { target: { value: 'Salut GPT' } })

    fireEvent.click(screen.getByRole('button', { name: 'Play model atoms' }))

    await waitFor(() => expect(screen.getAllByText('completed')).toHaveLength(2))
    expect(runAtomic).toHaveBeenCalledTimes(2)
    expect(runAtomic.mock.calls[0][0]).toMatchObject({ kind: 'tokenizer', sample: 'Salut GPT' })
    expect(runAtomic.mock.calls[1][0]).toMatchObject({ kind: 'model', tokenIds: [4, 8, 15, 16, 23, 42] })
    expect(screen.getByText('6 Token IDs')).toBeInTheDocument()
    expect(screen.getByLabelText('Model generation output')).toHaveTextContent('Predicted Token ID42')
    expect(screen.getByLabelText('Model generation output')).toHaveTextContent('42 (40.00%)')
    delete window.labo
  })

  it('steps one elastic execution level without completing the whole graph', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async (payload) => {
        if (payload.kind === 'tokenizer') return { engine: 'tokenizers', status: 'completed', tokenIds: [1, 2, 3], results: [] }
        const nodes = payload.kind === 'model' ? (payload.graph as { nodes: { id: string }[] }).nodes : []
        return { engine: 'pytorch', status: 'completed', results: nodes.map((node) => ({ atomId: node.id, status: 'passed', summary: `${node.id} ok` })) }
      },
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Step one model atom' }))

    await waitFor(() => expect(screen.getAllByText('paused')).toHaveLength(2))
    expect(screen.getByText('embedding + fixed-routes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Token IDs' }).closest('.architecture-node')).toHaveClass('status-passed')
    expect(screen.getByRole('button', { name: 'Select Tied token embedding' }).closest('.architecture-node')).toHaveClass('status-pending')
    delete window.labo
  })

  it('starts a fresh PyTorch trace when replaying or stepping after completion', async () => {
    const runAtomic = vi.fn(async (payload: { kind: 'model'; graph: unknown; tokenIds?: number[] } | { kind: 'tokenizer'; pipeline: unknown; sample?: string }) => {
      if (payload.kind === 'tokenizer') return { engine: 'tokenizers' as const, status: 'completed' as const, tokenIds: [1, 2, 3], results: [] }
      const nodes = payload.kind === 'model' ? (payload.graph as { nodes: { id: string }[] }).nodes : []
      return { engine: 'pytorch' as const, status: 'completed' as const, results: nodes.map((node) => ({ atomId: node.id, status: 'passed' as const, summary: `${node.id} ok` })) }
    })
    window.labo = { platform: 'darwin', runtime: 'electron', runAtomic }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Play model atoms' }))
    await waitFor(() => expect(screen.getAllByText('completed')).toHaveLength(2))
    expect(runAtomic).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Step one model atom' }))
    await waitFor(() => expect(screen.getAllByText('paused')).toHaveLength(2))
    expect(runAtomic).toHaveBeenCalledTimes(4)
    expect(screen.getByText('embedding + fixed-routes')).toBeInTheDocument()
    delete window.labo
  })

  it('opens Training Studio with real AdamW and Muon settings and PyTorch', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Training Studio' }))

    expect(screen.getByRole('button', { name: 'Use AdamW' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use Muon' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use Muon' }))
    expect(screen.getByRole('spinbutton', { name: 'Muon momentum' })).toHaveValue(0.95)
    expect(screen.getByText(/torch\.optim\.Muon\(model\.parameters\(\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'PyTorch' }))
    expect(screen.queryByText('training.optimizer')).not.toBeInTheDocument()
    expect(screen.getByText('optimizer.py')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Training graph' }))
    expect(screen.getByText('training.optimizer')).toBeInTheDocument()
    expect(screen.queryByText('optimizer.py')).not.toBeInTheDocument()
  })

  it('selects, edits, and adds freely manipulable model atoms', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Select Attention RMSNorm' }))
    const selectedCard = screen.getByRole('button', { name: 'Select Attention RMSNorm' }).closest('.architecture-node')
    expect(selectedCard).not.toHaveClass('editing')
    expect(selectedCard?.querySelector('.block-inline-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Attention RMSNorm' }))
    expect(screen.getByRole('spinbutton', { name: 'Model card setting epsilon' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Model card setting epsilon' }), { target: { value: '0.00001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect((screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value).toContain('self.attention_norm = nn.RMSNorm(1024, eps=1e-05)')

    fireEvent.click(screen.getByRole('button', { name: 'Add blocks' }))
    fireEvent.click(screen.getByText(/Activations/))
    fireEvent.click(screen.getByRole('button', { name: 'Add ReLU' }))
    expect(screen.getByText('21 atoms')).toBeInTheDocument()
    expect(screen.getByText('Atomic PyTorch draft')).toBeInTheDocument()
    const relu = screen.getByRole('button', { name: 'Select ReLU' })
    expect(relu.closest('.architecture-node')).toHaveAttribute('data-atom-id', 'relu')
    const updatedCode = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(updatedCode).toContain('# labo:node=relu-1 atom=relu')
    expect(updatedCode).toContain('self.relu_1 = nn.ReLU(inplace=False)')
    expect(updatedCode).not.toContain('relu_1_output = self.relu_1(')
  })

  it('drags a library card onto the requested graph position', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Blank starter' }))
    fireEvent.click(screen.getByText(/Activations/))

    const values = new Map<string, string>()
    const dataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      getData: (type: string) => values.get(type) ?? '',
      setData: (type: string, value: string) => values.set(type, value),
      get types() { return [...values.keys()] },
    }
    const libraryCard = screen.getByRole('button', { name: 'Add ReLU' })
    const canvas = screen.getByLabelText('Architecture graph canvas')

    expect(libraryCard).toHaveAttribute('draggable', 'true')
    fireEvent.dragStart(libraryCard, { dataTransfer })
    fireEvent.dragOver(canvas, { clientX: 740, clientY: 260, dataTransfer })
    expect(canvas).toHaveClass('accepts-library-drop')
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperties(dropEvent, {
      clientX: { value: 740 },
      clientY: { value: 260 },
      dataTransfer: { value: dataTransfer },
    })
    fireEvent(canvas, dropEvent)

    const droppedCard = screen.getByRole('button', { name: 'Select ReLU' }).closest('.architecture-node')
    expect(droppedCard).toHaveStyle({ left: '666px', top: '222px' })
    expect(canvas).not.toHaveClass('accepts-library-drop')
    expect(screen.getByText('1 atoms')).toBeInTheDocument()
  })

  it('exposes distinct semantic ports for routing and expert merging', () => {
    render(<App />)
    expect(document.querySelector('[data-port-id="fixed-routes-expertIndices-output"]')).toHaveAttribute('data-port-key', 'expertIndices')
    expect(document.querySelector('[data-port-id="fixed-routes-expertWeights-output"]')).toHaveAttribute('data-port-key', 'expertWeights')
    expect(document.querySelector('[data-port-id="branch-gates-routed-input"]')).toHaveAttribute('data-port-key', 'routed')
    expect(document.querySelector('[data-port-id="branch-gates-shared-input"]')).toHaveAttribute('data-port-key', 'shared')
  })

  it('unplugs an elastic cable by dragging its connected input into empty canvas', () => {
    render(<App />)

    const qkvInput = screen.getByRole('button', { name: 'qkv input H' })
    const elementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
    fireEvent.pointerDown(qkvInput, { clientX: 80, clientY: 160 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 300 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 300 })
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })

    expect(screen.getByText(/20 nodes · 30 links/)).toBeInTheDocument()
    expect(screen.getByText('Cable disconnected')).toBeInTheDocument()
    expect(screen.getByText('Neural IR invalid')).toBeInTheDocument()
    expect(screen.getByText(/Graph incomplete · 1 wiring issue/)).toBeInTheDocument()
    const code = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(code).toContain('class GeneratedModel(nn.Module):')
    expect(code).not.toContain('class GeneratedInvalidGraph')
    expect(code).toContain('self.attention_norm = nn.RMSNorm')
    expect(code).toContain('self.qkv_q =')
    expect(code).not.toContain('qkv_q = self.qkv_q(')
    expect(code).not.toContain('# labo:edge=attention-norm-qkv')
    expect(code).not.toContain('qkv_hidden: torch.Tensor')
  })

  it('previews and confirms Ask LABO elastics between existing blocks', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo: async () => ({
        summary: 'Reconnect the attention path.',
        addedBlocks: [],
        createdBlocks: [],
        connections: [{
          sourceId: 'attention-norm', sourcePortId: 'output', targetId: 'qkv', targetPortId: 'hidden', reason: 'QKV needs normalized hidden states.',
        }],
        missingBlocks: [],
        warnings: [],
      }),
    }
    render(<App />)

    const elementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'qkv input H' }), { clientX: 80, clientY: 160 })
    fireEvent.pointerUp(window, { clientX: 20, clientY: 300 })
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: elementFromPoint })
    expect(screen.getByText(/20 nodes · 30 links/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Reconnect the attention blocks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByText('1 elastic ready')).toBeInTheDocument()
    expect(screen.getByText('attention-norm.output')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply graph plan' }))
    expect(screen.getByText(/20 nodes · 31 links/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ask LABO' })).not.toBeInTheDocument()
    delete window.labo
  })

  it('previews and applies an agent-added atomic with its elastic', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo: async () => ({
        summary: 'Add a ReLU branch after the final normalization.',
        addedBlocks: [{ atomId: 'relu', nodeId: 'agent-relu', reason: 'The activation is not on the canvas.' }],
        createdBlocks: [],
        connections: [{
          sourceId: 'final-norm', sourcePortId: 'output', targetId: 'agent-relu', targetPortId: 'hidden', reason: 'Feed normalized states into the new activation.',
        }],
        missingBlocks: [],
        warnings: [],
      }),
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Add a ReLU after the final normalization' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByText('1 atomic block ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit ReLU' })).toBeInTheDocument()
    expect(screen.getByText('1 elastic ready')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select ReLU' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit ReLU' }))
    expect(screen.getByRole('dialog', { name: 'Edit agent card' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent card name' }), { target: { value: 'Reviewed ReLU' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))

    fireEvent.click(screen.getByRole('button', { name: 'Apply graph plan' }))
    expect(screen.getByRole('button', { name: 'Select Reviewed ReLU' })).toBeInTheDocument()
    expect(screen.getByText(/21 nodes · 32 links/)).toBeInTheDocument()
    delete window.labo
  })

  it('adds a complete parallel architecture without moving or wiring into existing cards', async () => {
    const askLabo = vi.fn(async () => ({
      summary: 'Add an independent branch.',
      addedBlocks: [
        { atomId: 'hidden-state-input', nodeId: 'parallel-input', reason: 'Independent input.' },
        { atomId: 'identity', nodeId: 'parallel-output', reason: 'Independent output.' },
      ],
      createdBlocks: [],
      connections: [{ sourceId: 'parallel-input', sourcePortId: 'hidden', targetId: 'parallel-output', targetPortId: 'hidden', reason: 'Internal branch connection.' }],
      missingBlocks: [],
      warnings: [],
    }))
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo,
    }
    render(<App />)
    const originalCard = screen.getByRole('button', { name: 'Select Token IDs' }).closest<HTMLElement>('.architecture-node')!
    const originalPosition = { left: originalCard.style.left, top: originalCard.style.top }

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.click(screen.getByRole('button', { name: 'New parallel' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Add another independent architecture' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByText('2 atomic blocks ready')).toBeInTheDocument()
    expect(askLabo).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ operationMode: 'parallel' }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply graph plan' }))
    expect(screen.getByText(/22 nodes · 32 links/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'PyTorch architecture' })).toHaveTextContent('TR 300M')
    expect(screen.getByRole('combobox', { name: 'PyTorch architecture' })).toHaveTextContent('Architecture 2')
    expect({ left: originalCard.style.left, top: originalCard.style.top }).toEqual(originalPosition)
    expect(Number.parseFloat(screen.getByRole('button', { name: 'Select Hidden State' }).closest<HTMLElement>('.architecture-node')!.style.left)).toBeGreaterThan(Number.parseFloat(originalPosition.left))
    delete window.labo
  })

  it('replaces false agent missing claims with native Token IDs and decoder cards', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo: async () => ({
        summary: 'Build a generation branch.',
        addedBlocks: [
          { atomId: 'token-embedding', nodeId: 'repair-embedding', reason: 'Embed tokens.' },
          { atomId: 'lm-head', nodeId: 'repair-head', reason: 'Produce logits.' },
        ],
        createdBlocks: [],
        connections: [{ sourceId: 'repair-embedding', sourcePortId: 'output', targetId: 'repair-head', targetPortId: 'hidden', reason: 'Project states.' }],
        missingBlocks: [
          { atomId: null, label: 'Source de Token IDs / tokenizer', reason: 'Aucun atomic disponible.' },
          { atomId: null, label: 'Échantillonneur ou décodeur de logits', reason: 'Convertir les logits en token généré.' },
        ],
        warnings: [],
      }),
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Build a generation branch' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByText('4 atomic blocks ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Greedy token decoder' })).toBeInTheDocument()
    expect(screen.queryByText('Missing blocks')).not.toBeInTheDocument()
    delete window.labo
  })

  it('previews an agent-generated safe PyTorch card before applying it', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo: async () => ({
        summary: 'Create a missing projection card.',
        addedBlocks: [],
        createdBlocks: [{ nodeId: 'agent-projection', label: 'Agent projection', pytorchModule: 'nn.Linear(1024, 1024, bias=False)', reason: 'A dedicated projection is required.' }],
        connections: [{ sourceId: 'final-norm', sourcePortId: 'output', targetId: 'agent-projection', targetPortId: 'hidden', reason: 'Project final hidden states.' }],
        missingBlocks: [],
        warnings: [],
      }),
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Create the missing projection' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByText('1 generated reusable card ready')).toBeInTheDocument()
    expect(screen.getByText('nn.Linear(1024, 1024, bias=False)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select Agent projection' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent projection' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent card name' }), { target: { value: 'Edited projection' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Agent card PyTorch module' }), { target: { value: 'nn.Linear(1024, 1024, bias=True)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply graph plan' }))
    expect(screen.getByRole('button', { name: 'Select Edited projection' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Edited projection' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Edited projection' }))
    expect(screen.getByRole('textbox', { name: 'Model card PyTorch module' })).toHaveValue('nn.Linear(1024, 1024, bias=True)')
    delete window.labo
  })

  it('auto-applies a clean agent plan when Auto apply mode is enabled', async () => {
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: true, source: 'secure-storage', encryptionAvailable: true }),
      askLabo: async () => ({
        summary: 'Add a ReLU after final normalization.',
        addedBlocks: [{ atomId: 'relu', nodeId: 'auto-relu', reason: 'Requested activation.' }],
        createdBlocks: [],
        connections: [{ sourceId: 'final-norm', sourcePortId: 'output', targetId: 'auto-relu', targetPortId: 'hidden', reason: 'Feed final states.' }],
        missingBlocks: [],
        warnings: ['The model stopped after a usable partial plan.'],
      }),
    }
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auto apply' }))
    fireEvent.change(screen.getByLabelText('What should these blocks build?'), { target: { value: 'Add a ReLU automatically' } })
    fireEvent.click(screen.getByRole('button', { name: 'Propose graph changes' }))

    expect(await screen.findByRole('button', { name: 'Select ReLU' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ask LABO' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('labo.ask.auto-apply.v1')).toBe('true')
    delete window.labo
  })

  it('lets each desktop user save, verify, and remove their own API key', async () => {
    const saveOpenAIKey = vi.fn(async () => ({ configured: true, source: 'secure-storage' as const, encryptionAvailable: true }))
    const deleteOpenAIKey = vi.fn(async () => ({ configured: false, source: 'none' as const, encryptionAvailable: true }))
    const testOpenAIKey = vi.fn(async () => ({ ok: true as const }))
    window.labo = {
      platform: 'darwin',
      runtime: 'electron',
      runAtomic: async () => ({ engine: 'pytorch', status: 'completed', results: [] }),
      getOpenAISettings: async () => ({ configured: false, source: 'none', encryptionAvailable: true }),
      saveOpenAIKey,
      deleteOpenAIKey,
      testOpenAIKey,
    }
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Ask LABO' }))

    expect(await screen.findByText('No API key configured for this user.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('OpenAI API key'), { target: { value: 'sk-project-user-secret-123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save and verify key' }))
    expect(await screen.findByText('Key saved and verified with OpenAI.')).toBeInTheDocument()
    expect(saveOpenAIKey).toHaveBeenCalledWith('sk-project-user-secret-123456789')
    expect(testOpenAIKey).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('API key removed from this user account.')).toBeInTheDocument()
    expect(deleteOpenAIKey).toHaveBeenCalledOnce()
    delete window.labo
  })

  it('pans and zooms the graph viewport without changing graph coordinates', () => {
    render(<App />)
    const canvas = screen.getByLabelText('Architecture graph canvas')
    const world = screen.getByTestId('graph-world')

    expect(world).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
    fireEvent.wheel(canvas, { deltaX: 45, deltaY: 30 })
    expect(world).toHaveStyle({ transform: 'translate(-45px, -30px) scale(1)' })

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('110%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(screen.getByRole('button', { name: 'Reset zoom' })).toHaveTextContent('100%')
    expect(screen.getByRole('button', { name: 'Fit graph' })).toBeInTheDocument()
  })

  it('moves a stacked model card with a direct pointer drag', () => {
    render(<App />)
    const canvas = screen.getByLabelText('Architecture graph canvas')
    const handle = screen.getByRole('button', { name: 'Select Attention RMSNorm' })
    const card = handle.closest('.architecture-node') as HTMLElement
    const initialLeft = Number.parseFloat(card.style.left)
    const initialTop = Number.parseFloat(card.style.top)

    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 120, clientY: 180 })
    fireEvent.pointerMove(canvas, { pointerId: 7, clientX: 320, clientY: 275 })

    expect(card).toHaveClass('dragging')
    expect(Number.parseFloat(card.style.left)).toBe(initialLeft + 200)
    expect(Number.parseFloat(card.style.top)).toBe(initialTop + 95)

    fireEvent.pointerUp(canvas, { pointerId: 7, clientX: 320, clientY: 275 })
    expect(card).not.toHaveClass('dragging')
    expect(Number.parseFloat(card.style.left)).toBe(initialLeft + 200)
    expect(Number.parseFloat(card.style.top)).toBe(initialTop + 95)
  })

  it('keeps elastic endpoints stable when selecting a fixed-size card', () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function () {
      const portId = this.getAttribute?.('data-port-id') ?? ''
      const x = portId.includes('qkv-') ? 220 : 160
      const y = portId.includes('qkv-') ? 320 : 160
      return { x, y, left: x, top: y, right: x + 16, bottom: y + 16, width: 16, height: 16, toJSON: () => ({}) } as DOMRect
    }
    try {
      render(<App />)
      const qkvCable = document.querySelector('[data-edge-id="attention-norm-qkv"]')
      const before = qkvCable?.getAttribute('d')
      fireEvent.click(screen.getByRole('button', { name: 'Select GQA QKV projection' }))
      expect(screen.getByRole('button', { name: 'Select GQA QKV projection' }).closest('.architecture-node')).not.toHaveClass('editing')
      expect(qkvCable?.getAttribute('d')).toBe(before)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect
    }
  })

  it('never clips circular plugs at atom boundaries', () => {
    render(<App />)
    const embeddingCard = screen.getByRole('button', { name: 'Select Tied token embedding' }).closest('.architecture-node')
    const routedCard = screen.getByRole('button', { name: 'Select 4 × routed SwiGLU' }).closest('.architecture-node')
    expect(embeddingCard).toHaveStyle({ overflow: 'visible' })
    expect(routedCard).toHaveStyle({ overflow: 'visible' })
  })

  it('deletes a model atom without recreating it in PyTorch', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select GQA QKV projection' }))
    expect(screen.getByRole('dialog', { name: 'Edit model card' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete card' }))

    const code = (screen.getByRole('textbox', { name: 'PyTorch editor' }) as HTMLTextAreaElement).value
    expect(code).not.toContain('self.qkv_q =')
    expect(code).toContain('class GeneratedModel(nn.Module):')
    expect(code).not.toContain('class GeneratedInvalidGraph')
    expect(code).not.toContain('self.head_layout')
    expect(code).not.toContain('head_layout_q: torch.Tensor')
    expect(screen.getByText('Neural IR invalid')).toBeInTheDocument()
    expect(screen.getByText(/Graph incomplete · \d+ wiring issues?/)).toBeInTheDocument()
  })

  it('applies supported PyTorch edits back to the same model atom', () => {
    render(<App />)

    const editor = screen.getByRole('textbox', { name: 'PyTorch editor' })
    fireEvent.change(editor, { target: { value: (editor as HTMLTextAreaElement).value.replace('self.attention_norm = nn.RMSNorm(1024, eps=1e-06)', 'self.attention_norm = nn.RMSNorm(1024, eps=1e-05)') } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply PyTorch to blocks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Attention RMSNorm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit cards' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select Attention RMSNorm' }))

    expect(screen.getByRole('spinbutton', { name: 'Model card setting epsilon' })).toHaveValue(0.00001)
  })

  it('opens the atomic Tokenizer Studio and compiles its IR to Python or Rust', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Tokenizer Studio' }))

    expect(screen.getByText('Research BPE')).toBeInTheDocument()
    expect(screen.getAllByText('Unicode normalization').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Byte-level pre-tokenizer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('BPE trainer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: 'Python' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Rust' })).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Rust' }))
    expect(screen.getByText(/vocab_size\(4096\)/)).toBeInTheDocument()
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
})
