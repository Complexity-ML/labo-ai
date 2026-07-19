# LABO AI

LABO AI is a desktop laboratory for composing neural architectures from executable atomic blocks. It combines a visual graph editor, generated PyTorch, step-by-step execution, and a constrained AI graph planner.

## OpenAI Build Week: Codex and GPT-5.6

LABO AI was created during OpenAI Build Week with Codex as the primary engineering environment and GPT-5.6 as the reasoning model used for the core build. The repository's dated commit history records the implementation during the submission period.

Codex accelerated the project across the Electron, React, TypeScript and Python boundaries. It was used to inspect and refactor the evolving graph editor, implement typed card contracts and graph/PyTorch synchronization, diagnose the packaged Python runtime, build SQLite workspace persistence, harden encrypted API-key handling, create macOS and Windows packages, and repeatedly run the desktop validation suite. Codex also drove the automated demo workflow and helped identify cross-architecture failures that were difficult to reproduce manually.

GPT-5.6 was used inside Codex for the cross-cutting implementation and debugging work, and it is also the default model behind Ask LABO (`gpt-5.6-terra`). Ask LABO receives a bounded view of the card catalog and current graph, then uses strict tools to inspect, search, add, connect, create, arrange, execute, save and export. Its output is validated locally before it can mutate the graph.

The key product decisions remained human-directed: use atomic typed cards instead of an unrestricted code editor; preserve existing architectures as read-only in parallel mode; separate review from auto-apply; make architecture deletion explicitly targeted; keep card creation in a central visual modal; encrypt user API keys locally; and represent parallel computation through stable topology-aware XY placement. Codex helped turn those decisions into tested product behavior and iterate quickly when the first versions were ambiguous or unsafe.

## Current capabilities

- More than 100 typed, executable model cards grouped by useful families.
- Blank, GPT-like, learned-MoE, token-routing, and TR 300M starters.
- Executable Vision Transformer, multimodal image-editing, and spatiotemporal video starters with dedicated media atomics.
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
- SQLite-backed graph drafts, cards, optimizer configurations and user presets, preserved across application updates.
- Per-user OpenAI API key management through Electron encrypted storage; keys can be tested and deleted from the UI.

## Judge quick start

No rebuild or account is required. Download the signed-off hackathon alpha from the [LABO AI product page](https://www.complexity-ai.fr/labo-ai) or the [GitHub v0.1.0 release](https://github.com/Complexity-ML/labo-ai/releases/tag/v0.1.0).

Supported packages:

- macOS 12 or later on Apple silicon: DMG and portable ZIP.
- Windows 10/11 x64: NSIS installer and portable ZIP.
- Windows ARM64: portable ZIP.

The builds are currently unsigned, so macOS Gatekeeper or Windows SmartScreen may request confirmation on first launch.

Suggested test path:

1. Open **Blank starter** and drag typed cards from the block library.
2. Open **Ask LABO**, choose **New parallel** and **Auto apply**, then request a compact GPT-like QA architecture.
3. Add your own OpenAI API key when prompted. It is encrypted locally with Electron `safeStorage` and is never returned to the renderer.
4. Run the resulting graph with the atomic player, then inspect the **PyTorch** and **Split** views.
5. Save the workspace as a preset and export the graph as SVG or the generated model as Python.

Graph editing, built-in presets, PyTorch inspection, local execution and export can be tested without an API key. Only Ask LABO requires one.

## Development

Requirements:

- Node.js and npm
- Python 3 with the packages in `requirements-runtime.txt`
- macOS or Windows for the packaged desktop build

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

Create the Windows NSIS installer and ZIP on a Windows build host:

```bash
npm run package:win
```

Run the guided one-minute agent demo after adding an API key in the app:

```bash
npm run demo:agent
```

The recording sequence and hackathon copy are in [`docs/hackathon-submission.md`](docs/hackathon-submission.md).

Artifacts are written to `release/`. The Python atomic runtime is bundled as an Electron extra resource so packaged builds do not resolve it through the application archive.

### Publish a desktop release

The package version is the release source of truth. After the release changes are committed on `main`, bump it and push the generated commit and tag:

```bash
npm version patch
git push origin main --follow-tags
```

The `Desktop release` workflow verifies that the `vX.Y.Z` tag matches `package.json`, validates the project, builds Apple-silicon macOS and Windows x64 packages on their native runners, and publishes them to the matching GitHub release. The Complexity website reads the latest published release automatically, so its download buttons do not require a separate version edit.

## Security model

- Renderer isolation is enforced through the Electron preload bridge.
- OpenAI keys are encrypted with Electron `safeStorage` and never exposed to the renderer after saving.
- Ask LABO receives a bounded graph context and must return a strict structured plan.
- Custom PyTorch cards accept only explicitly supported `torch.nn` constructors and literal arguments.
- Generated graphs run through the dedicated local Python runtime, not through arbitrary shell evaluation.
