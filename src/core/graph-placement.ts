import type { ArchitectureGraph } from './ir'

const horizontalStep = 180
const verticalStep = 125
const horizontalClearance = 165
const verticalClearance = 112

export function findOpenGraphPosition(graph: ArchitectureGraph): { x: number; y: number } {
  const startX = 35
  const startY = 55
  const columns = 8

  for (let row = 0; row < 120; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const candidate = { x: startX + column * horizontalStep, y: startY + row * verticalStep }
      const occupied = graph.nodes.some((node) => (
        Math.abs(node.position.x - candidate.x) < horizontalClearance
        && Math.abs(node.position.y - candidate.y) < verticalClearance
      ))
      if (!occupied) return candidate
    }
  }

  return {
    x: Math.max(startX, ...graph.nodes.map((node) => node.position.x)) + horizontalStep,
    y: startY,
  }
}
