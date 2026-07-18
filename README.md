# LABO AI

LABO AI is a desktop laboratory for composing neural architectures from executable atomic blocks. It combines a visual graph editor, generated PyTorch, step-by-step execution, and a constrained AI graph planner.

## Current capabilities

- More than 100 typed, executable model cards grouped by useful families.
- Blank, GPT-like, learned-MoE, token-routing, and TR 300M starters.
- Drag-and-drop graph composition with typed elastic cables and collision-aware card placement.
- Two-way graph/PyTorch synchronization for supported semantic atoms.
- User-created reusable PyTorch cards using a safe `nn.Module` constructor allowlist.
- Atomic PyTorch player with run, rerun, reset, and step-by-step execution.
- Tokenizer and training studios.
- Ask LABO planner that can add available blocks, connect compatible ports, or report missing capabilities.
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
