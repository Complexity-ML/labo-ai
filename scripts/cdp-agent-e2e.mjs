const endpoint = process.argv[2] || 'http://127.0.0.1:9334/json/list'
const parallel = process.argv.slice(3).includes('--parallel')
const prompt = process.argv.slice(3).filter((argument) => argument !== '--parallel').join(' ').trim()
  || (parallel ? 'Add a small executable GPT-like language model as a separate parallel architecture.' : 'Build a small executable DeepSeek-like language model from the Blank Starter.')

const pages = await fetch(endpoint).then((response) => response.json())
const page = pages.find((candidate) => candidate.type === 'page' && candidate.title === 'LABO AI')
if (!page?.webSocketDebuggerUrl) throw new Error('No LABO AI renderer was found on the debugging endpoint')

const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let sequence = 0
const pending = new Map()
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (!message.id || !pending.has(message.id)) return
  const { resolve, reject } = pending.get(message.id)
  pending.delete(message.id)
  if (message.error) reject(new Error(message.error.message))
  else resolve(message.result)
})

function send(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result?.value
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(expression, timeout = 60_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await evaluate(expression)
    if (value) return value
    await wait(250)
  }
  throw new Error(`Timed out waiting for: ${expression}`)
}

await send('Runtime.enable')
await waitFor(`document.querySelector('button[aria-label="Play model atoms"]') !== null`)
await evaluate(`(() => {
  const exactButton = (text) => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === text)
  exactButton(${JSON.stringify(parallel ? 'TR 300M' : 'Blank starter')})?.click()
  const askButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Ask LABO'))
  askButton?.click()
})()`)
await waitFor(`document.querySelector('.ask-labo-key-heading')?.textContent.includes('Connected') === true`)
const beforeCards = await evaluate(`[...document.querySelectorAll('.architecture-node')].map((element) => ({ atomId: element.dataset.atomId, label: element.querySelector('strong')?.textContent.trim(), x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }))`)
await evaluate(`(() => {
  const review = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Review')
  review?.click()
  if (${parallel}) [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'New parallel')?.click()
  const textarea = document.querySelector('#ask-labo-request')
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(textarea, ${JSON.stringify(prompt)})
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await waitFor(`[...document.querySelectorAll('button')].some((button) => button.textContent.includes('Propose graph changes') && !button.disabled)`)
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Propose graph changes')).click()`)
await waitFor(`document.querySelector('.ask-labo-result, .ask-labo-error') !== null`, 90_000)

const preview = await evaluate(`(() => ({
  error: document.querySelector('.ask-labo-error')?.textContent.trim() ?? null,
  summary: document.querySelector('.ask-labo-result section p')?.textContent.trim() ?? null,
  addedBlocks: [...document.querySelectorAll('.ask-labo-added-blocks > div')].map((element) => ({
    nodeId: element.querySelector('strong')?.textContent.trim(),
    atomId: element.querySelector('code')?.textContent.trim(),
    reason: element.querySelector('small')?.textContent.trim(),
  })),
  createdBlocks: [...document.querySelectorAll('.ask-labo-created-blocks > div')].map((element) => ({
    label: element.querySelector('strong')?.textContent.trim(),
    pytorchModule: element.querySelector('code')?.textContent.trim(),
    reason: element.querySelector('small')?.textContent.trim(),
  })),
  missingBlocks: [...document.querySelectorAll('.ask-labo-missing > div')].map((element) => ({
    label: element.querySelector('strong')?.textContent.trim(),
    reason: element.querySelector('small')?.textContent.trim(),
  })),
  warnings: [...document.querySelectorAll('.ask-labo-warnings p')].map((element) => element.textContent.trim()),
  connectionCount: document.querySelectorAll('.ask-labo-connections li').length,
  canApply: !document.querySelector('.ask-labo-apply')?.disabled,
}))()`)

let graph = null
let player = null
if (preview.canApply) {
  await evaluate(`document.querySelector('.ask-labo-apply').click()`)
  await waitFor(`document.querySelector('.ask-labo-panel') === null`)
  graph = await evaluate(`(() => ({
    status: document.querySelector('.statusbar')?.textContent.trim(),
    compileStatus: document.querySelector('.toolbar-meta > span')?.textContent.trim(),
    cards: [...document.querySelectorAll('.architecture-node')].map((element) => ({
      id: element.dataset.nodeId,
      atomId: element.dataset.atomId,
      label: element.querySelector('strong')?.textContent.trim(),
      x: Number.parseFloat(element.style.left),
      y: Number.parseFloat(element.style.top),
    })),
    edges: document.querySelectorAll('[data-edge-id]').length,
  }))()`)

  if (graph.status?.includes('Neural IR valid')) {
    await evaluate(`document.querySelector('button[aria-label="Play model atoms"]').click()`)
    await waitFor(`['completed', 'failed'].includes(document.querySelector('.player-status')?.textContent.trim())`, 90_000)
    player = await evaluate(`(() => ({
      status: document.querySelector('.player-status')?.textContent.trim(),
      error: document.querySelector('.execution-error')?.textContent.trim() ?? null,
      output: document.querySelector('[aria-label="Model generation output"]')?.textContent.trim(),
    }))()`)
  }

  await evaluate(`(() => {
    const reset = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Reset current preset')
    reset?.click()
  })()`)
}

const existingPreserved = graph ? beforeCards.every((card, index) => JSON.stringify(card) === JSON.stringify(graph.cards[index])) : null
process.stdout.write(`${JSON.stringify({ prompt, parallel, existingPreserved, preview, graph, player }, null, 2)}\n`)
socket.close()
