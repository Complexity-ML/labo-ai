# LABO AI — hackathon submission draft

## Project story

### Inspiration

Neural-network code is easy to copy and difficult to inspect. Architectures hide tensor contracts, parallel branches, routing decisions and execution order inside large Python files. LABO AI started from a simple question: what if a model could be assembled, understood and executed as a graph of small typed cards—and what if an agent had to use the same explicit tools as a human?

### What it does

LABO AI is an Electron desktop laboratory for neural architecture design. Users can combine more than 100 atomic cards, connect typed “elastic” ports, compare multiple architectures side by side, and inspect synchronized PyTorch. The local atomic player can run, rerun or step through a graph. Users can create reusable safe PyTorch cards, save independent workspaces in SQLite, search the catalog in natural language, and export a vector diagram or Python source.

Ask LABO is a constrained graph agent. It sees the current topology and card capabilities, searches the catalog, creates a safe card when an allowed primitive is missing, connects compatible ports, arranges parallel branches, runs the result, saves it as a workspace and reports any capability it cannot provide. Review mode previews every mutation; Auto apply executes only operations that pass local validation. Existing work can remain read-only while the agent builds a new architecture in parallel.

### How we built it

The desktop shell uses Electron, React, TypeScript and Vite. A typed intermediate representation describes cards, ports, edges, groups and architecture metadata. A semantic registry drives the block library, graph validation, PyTorch generation and the bounded agent tool surface. Topology-aware placement assigns stable execution ranks and parallel lanes while reducing cable crossings. PyTorch execution runs in a separate local Python process through a narrow Electron IPC bridge. User workspaces are stored in a native SQLite database; OpenAI API keys are encrypted with Electron `safeStorage` and are never returned to the renderer.

### Challenges

The hardest part was keeping four views consistent: the visual graph, tensor contracts, generated PyTorch and runtime execution. Parallel architectures also exposed subtle failure modes: one invalid branch must not leave another branch waiting forever, layout must preserve forks and joins, and deleting or restoring work must always identify its exact target. We therefore made architecture boundaries explicit, isolated parallel runs, added deterministic layout tests and replaced ambiguous destructive actions with named, confirmed operations.

### What we learned

Agentic graph editing works best when the agent is not given an unrestricted code editor. A small catalog of observable tools—inspect, search, add, connect, create, move, run, save and export—produces plans users can audit and software can validate. The same typed contracts that make the UI understandable also make agent actions safer.

### What is next

Next steps are a self-contained Python runtime, more architecture-level validation, collaborative preset sharing and signed Windows/macOS release automation. We also want reusable compound cards so a validated subgraph can become one higher-level atomic component.

## Built with

Electron, React, TypeScript, Vite, PyTorch, Python, OpenAI API, SQLite, Electron safeStorage, SVG, Vitest, Testing Library, electron-builder

## Try it out

- Source: https://github.com/Complexity-ML/labo-ai
- Desktop releases: https://github.com/Complexity-ML/labo-ai/releases

## 60-second video plan

Use a 1440×900 capture and hide notifications. Run `npm run demo:agent`, then record only the LABO AI window.

| Time | Visual | Voice-over |
| --- | --- | --- |
| 0–6 s | TR 300M graph, then Blank starter | “LABO AI turns neural architectures into typed, executable atomic graphs.” |
| 6–15 s | Open Ask LABO; Auto apply | “Its agent sees the real card catalog and topology, not a screenshot.” |
| 15–31 s | Prompt appears; agent builds | “It searches native capabilities, creates only safe missing primitives, and wires compatible tensor ports.” |
| 31–42 s | Completed graph and parallel layout | “The XY engine makes sequence, forks and joins readable while preserving existing work.” |
| 42–50 s | Switch to PyTorch | “The same graph produces inspectable PyTorch.” |
| 50–57 s | Atomic player completes with output | “Execution is local and can be replayed or stepped atom by atom.” |
| 57–60 s | Saved workspace and Export control | “Save, compare and export—without losing the graph.” |

If the live API response takes longer, cut the waiting section to a two-second jump cut. Do not accelerate the graph construction or execution result itself.

## Suggested gallery

1. Hero: Split view with a complete routed architecture and generated PyTorch.
2. Ask LABO: Review plan with tools, cards and typed elastics.
3. Parallel comparison: two named architectures on one canvas.
4. Card Builder: category-aware blocks and explicit destination choices.
5. Atomic execution: completed run with generated token output.
