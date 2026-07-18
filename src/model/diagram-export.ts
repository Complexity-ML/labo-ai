import type { ArchitectureGraph, ArchitectureNode, TensorRole } from '../core/ir'

const cardWidth = 148
const cardHeight = 76

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function roleColor(role: TensorRole): string {
  return ({ query: '#5797ff', key: '#d99a3d', value: '#8b73ff', logits: '#c678dd', attention: '#7c75ff', 'token-ids': '#39c887' } as Partial<Record<TensorRole, string>>)[role] ?? '#69717e'
}

function nodeColor(node: ArchitectureNode): string {
  if (node.kind === 'input') return '#39c887'
  if (node.kind === 'custom-pytorch') return '#62a9ff'
  if (node.role === 'logits' || node.role === 'output') return '#9b91ff'
  return roleColor(node.role)
}

export function architectureDiagramSvg(graph: ArchitectureGraph): string {
  if (graph.nodes.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><rect width="720" height="420" fill="#090a0c"/><text x="360" y="210" fill="#7d8490" text-anchor="middle" font-family="monospace">${xml(graph.name)} · blank graph</text></svg>`
  const minX = Math.min(...graph.nodes.map((node) => node.position.x)) - 45
  const maxX = Math.max(...graph.nodes.map((node) => node.position.x + cardWidth)) + 45
  const minY = Math.min(...graph.nodes.map((node) => node.position.y - cardHeight / 2)) - 70
  const maxY = Math.max(...graph.nodes.map((node) => node.position.y + cardHeight / 2)) + 55
  const width = Math.max(420, maxX - minX)
  const height = Math.max(260, maxY - minY)
  const position = (node: ArchitectureNode) => ({ x: node.position.x - minX, y: node.position.y - minY })
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const edges = graph.edges.map((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target) return ''
    const from = position(source)
    const to = position(target)
    const sx = from.x + cardWidth / 2
    const sy = from.y + cardHeight / 2
    const tx = to.x + cardWidth / 2
    const ty = to.y - cardHeight / 2
    const middle = sy + (ty - sy) / 2
    const color = roleColor(source.role)
    return `<path d="M ${sx} ${sy} C ${sx} ${middle}, ${tx} ${middle}, ${tx} ${ty}" fill="none" stroke="${color}" stroke-width="2" opacity="0.82" marker-end="url(#arrow)"/>`
  }).join('')
  const nodes = graph.nodes.map((node) => {
    const point = position(node)
    const top = point.y - cardHeight / 2
    return `<g transform="translate(${point.x} ${top})"><rect width="${cardWidth}" height="${cardHeight}" rx="8" fill="#15171c" stroke="${nodeColor(node)}" stroke-width="1.5"/><text x="12" y="18" fill="#747c88" font-size="8" font-family="monospace" letter-spacing="0.6">${xml((node.atomId ?? node.kind).toUpperCase())}</text><text x="12" y="40" fill="#edf0f5" font-size="11" font-family="sans-serif" font-weight="600">${xml(node.label.slice(0, 22))}</text><text x="12" y="59" fill="#767e8b" font-size="8" font-family="monospace">${xml(node.role)}</text></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${xml(graph.name)}</title><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#252932" stroke-width="0.6"/></pattern><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#77808d"/></marker></defs><rect width="100%" height="100%" fill="#090a0c"/><rect width="100%" height="100%" fill="url(#grid)"/><text x="18" y="25" fill="#aeb5c0" font-family="monospace" font-size="11">${xml(graph.name)} · ${graph.nodes.length} cards · ${graph.edges.length} links</text>${edges}${nodes}</svg>`
}

export function exportFileName(graph: ArchitectureGraph, extension: 'svg' | 'py'): string {
  const base = graph.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'labo-architecture'
  return `${base}.${extension}`
}
