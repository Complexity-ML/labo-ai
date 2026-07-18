# LABO AI

LABO AI is a desktop laboratory for composing neural architectures from executable atomic blocks. It combines a visual graph editor, generated PyTorch, step-by-step execution, and a constrained AI graph planner.

## Current capabilities

- More than 100 typed, executable model cards grouped by useful families.
- Blank, GPT-like, learned-MoE, token-routing, and TR 300M starters.
- Drag-and-drop graph composition with typed elastic cables and deterministic topology-aware XY placement that preserves parallel lanes and minimizes crossings.
- Two-way graph/PyTorch synchronization for supported semantic atoms.
- Dedicated modal card builder with category-aware auto-composition, visual input/operation/output blocks, typed plugs, and a safe generated `nn.Module` preview.
- Separate add and edit modes; existing cards open in a central editor and user-created library cards can be deleted.
- Natural-language card search across native atomics and graph inputs.
- Contextual card construction palettes whose operations and typed plugs follow the selected category.
- Vector SVG diagram and generated PyTorch export through the desktop save dialog.
- Atomic PyTorch player with run, rerun, reset, and step-by-step execution.
- Tokenizer and training studios.
- Ask LABO planner that can add available blocks, connect compatible ports, or report missing capabilities.
- Parallel-aware automatic graph layout and multi-architecture composition without overwriting the current canvas.
- IndexedDB-backed graph drafts and user presets, preserved while switching starters.
- Per-user OpenAI API key management through Electron encrypted storage; keys can be tested and deleted from the UI.

## Development

Requirements:

- Node.js and npm
- Python 3 with the packages in `requirements-runtime.txt`
- macOS for the packaged desktop build

```bash
npm install
npm run electron:dev
```

Run the validation suite:

```bash
npm test
npm run lint
npm run test:desktop
```

## Desktop build

Build and start Electron locally:

```bash
npm run electron:start
```

Create the macOS application, DMG, and ZIP:

```bash
npm run package:mac
```

Artifacts are written to `release/`. The Python atomic runtime is bundled as an Electron extra resource so packaged builds do not resolve it through the application archive.

## Security model

- Renderer isolation is enforced through the Electron preload bridge.
- OpenAI keys are encrypted with Electron `safeStorage` and never exposed to the renderer after saving.
- Ask LABO receives a bounded graph context and must return a strict structured plan.
- Custom PyTorch cards accept only explicitly supported `torch.nn` constructors and literal arguments.
- Generated graphs run through the dedicated local Python runtime, not through arbitrary shell evaluation.
