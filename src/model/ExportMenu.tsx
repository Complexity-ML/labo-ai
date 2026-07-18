import { Download } from 'lucide-react'
import type { ArchitectureGraph } from '../core/ir'
import { architectureDiagramSvg, exportFileName } from './diagram-export'

async function saveFile(filename: string, content: string, kind: 'svg' | 'python') {
  if (window.labo?.exportFile) return window.labo.exportFile({ filename, content, kind })
  const blob = new Blob([content], { type: kind === 'svg' ? 'image/svg+xml' : 'text/x-python' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return { saved: true }
}

export function ExportMenu({ graph, code }: { graph: ArchitectureGraph; code: string }) {
  const close = (target: HTMLElement) => target.closest('details')?.removeAttribute('open')
  const diagram = () => saveFile(exportFileName(graph, 'svg'), architectureDiagramSvg(graph), 'svg')
  const pytorch = () => saveFile(exportFileName(graph, 'py'), code, 'python')
  return <details className="export-menu">
    <summary aria-label="Export architecture"><Download size={13} /><span>Export</span></summary>
    <div>
      <button onClick={(event) => { close(event.currentTarget); void diagram() }}><strong>Diagram SVG</strong><small>Vector Blockly graph</small></button>
      <button onClick={(event) => { close(event.currentTarget); void pytorch() }}><strong>PyTorch code</strong><small>Generated .py module</small></button>
      <button onClick={(event) => { close(event.currentTarget); void (async () => { await diagram(); await pytorch() })() }}><strong>Diagram + code</strong><small>Export both files</small></button>
    </div>
  </details>
}
