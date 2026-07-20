import type { CSSProperties, PointerEvent, ReactNode } from 'react'

export function StudioContextMenu({ children, className = '', position }: { children: ReactNode; className?: string; position: { x: number; y: number } }) {
  return <div className={`card-context-menu ${className}`.trim()} role="menu" style={{ left: position.x, top: position.y } as CSSProperties} onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.stopPropagation()}>{children}</div>
}

export function StudioContextMenuItem({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick(): void }) {
  return <button className={className} onClick={onClick} role="menuitem" type="button">{children}</button>
}
