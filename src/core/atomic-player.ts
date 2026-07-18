export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'completed' | 'failed' | 'stopped'
export type AtomExecutionStatus = 'pending' | 'running' | 'passed' | 'failed'

export interface AtomExecutionResult {
  atomId: string
  status: AtomExecutionStatus
  summary?: string
  error?: string
}

export interface AtomicPlayerSnapshot {
  status: PlayerStatus
  currentAtomId?: string
  currentAtomIds?: string[]
  error?: string
  results: AtomExecutionResult[]
}

export type AtomicExecutor = (atomId: string) => Promise<{ summary?: string }>
export type PlayerListener = (snapshot: AtomicPlayerSnapshot) => void
export interface AtomicPlayerOptions {
  onRestart?: () => void
}

export class AtomicPlayer {
  private readonly stages: string[][]
  private readonly executor: AtomicExecutor
  private readonly onRestart?: () => void
  private readonly listeners = new Set<PlayerListener>()
  private readonly atomIds: string[]
  private cursor = 0
  private state: AtomicPlayerSnapshot

  constructor(plan: string[] | string[][], executor: AtomicExecutor, options: AtomicPlayerOptions = {}) {
    this.stages = plan.map((stage) => typeof stage === 'string' ? [stage] : [...stage])
    this.atomIds = this.stages.flat()
    this.executor = executor
    this.onRestart = options.onRestart
    this.state = {
      status: 'idle',
      currentAtomId: this.atomIds[0],
      currentAtomIds: this.stages[0],
      results: this.atomIds.map((atomId) => ({ atomId, status: 'pending' })),
    }
  }

  get snapshot(): AtomicPlayerSnapshot {
    return {
      ...this.state,
      results: this.state.results.map((result) => ({ ...result })),
    }
  }

  subscribe(listener: PlayerListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  async play(): Promise<void> {
    if (this.state.status === 'completed' || this.state.status === 'failed' || this.state.status === 'stopped') this.restart()
    if (this.isTerminal()) return
    this.setState({ status: 'playing', error: undefined })
    while (this.state.status === 'playing' && this.cursor < this.stages.length) {
      await this.executeCurrent(false)
    }
  }

  async step(): Promise<void> {
    if (this.state.status === 'completed' || this.state.status === 'failed' || this.state.status === 'stopped') this.restart()
    if (this.isTerminal()) return
    this.setState({ status: 'playing', error: undefined })
    await this.executeCurrent(true)
  }

  pause(): void {
    if (this.state.status === 'playing') this.setState({ status: 'paused' })
  }

  stop(): void {
    if (this.state.status === 'completed' || this.state.status === 'failed') return
    this.setState({ status: 'stopped' })
  }

  private isTerminal(): boolean {
    return this.state.status === 'completed' || this.state.status === 'failed' || this.state.status === 'stopped'
  }

  private restart(): void {
    this.cursor = 0
    this.onRestart?.()
    this.state = {
      status: 'idle',
      currentAtomId: this.atomIds[0],
      currentAtomIds: this.stages[0],
      error: undefined,
      results: this.atomIds.map((atomId) => ({ atomId, status: 'pending' })),
    }
    this.emit()
  }

  private async executeCurrent(pauseAfterSuccess: boolean): Promise<void> {
    const stage = this.stages[this.cursor]
    if (!stage?.length) {
      this.setState({ status: 'completed', currentAtomId: undefined, currentAtomIds: undefined })
      return
    }

    const running = this.state.results.map((result) => stage.includes(result.atomId) ? { atomId: result.atomId, status: 'running' as const } : result)
    this.state = { ...this.state, currentAtomId: stage[0], currentAtomIds: stage, results: running }
    this.emit()

    const outputs = await Promise.allSettled(stage.map((atomId) => this.executor(atomId)))
    const completed = [...this.state.results]
    let failure: { atomId: string; message: string } | undefined
    for (const [stageIndex, atomId] of stage.entries()) {
      const index = completed.findIndex((result) => result.atomId === atomId)
      const output = outputs[stageIndex]
      if (output.status === 'fulfilled') completed[index] = { atomId, status: 'passed', summary: output.value.summary }
      else {
        const message = output.reason instanceof Error ? output.reason.message : String(output.reason)
        completed[index] = { atomId, status: 'failed', error: message }
        failure ??= { atomId, message }
      }
    }
    this.state = { ...this.state, results: completed }
    this.emit()

    if (failure) {
      this.setState({ status: 'failed', currentAtomId: failure.atomId, currentAtomIds: [failure.atomId], error: failure.message })
      return
    }

    this.cursor += 1
    const nextStage = this.stages[this.cursor]
    if (!nextStage) {
      this.setState({ status: 'completed', currentAtomId: undefined, currentAtomIds: undefined })
    } else {
      this.setState({
        status: pauseAfterSuccess ? 'paused' : this.state.status,
        currentAtomId: nextStage[0],
        currentAtomIds: nextStage,
      })
    }
  }

  private setState(patch: Partial<AtomicPlayerSnapshot>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  private emit(): void {
    const snapshot = this.snapshot
    for (const listener of this.listeners) listener(snapshot)
  }
}
