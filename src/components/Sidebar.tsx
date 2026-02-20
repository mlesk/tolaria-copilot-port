import { useState, memo, type ComponentType } from 'react'
import type { VaultEntry, SidebarSelection } from '../types'
import { cn } from '@/lib/utils'
import { ChevronRight, ChevronDown, GitCommitHorizontal } from 'lucide-react'
import { getTypeColor, getTypeLightColor } from '../utils/typeColors'
import {
  FileText,
  Star,
  Wrench,
  Flask,
  Target,
  ArrowsClockwise,
  Users,
  CalendarBlank,
  Tag,
  TagSimple,
  Trash,
  StackSimple,
  type IconProps,
} from '@phosphor-icons/react'

interface SidebarProps {
  entries: VaultEntry[]
  selection: SidebarSelection
  onSelect: (selection: SidebarSelection) => void
  onSelectNote?: (entry: VaultEntry) => void
  modifiedCount?: number
  onCommitPush?: () => void
}

const TOP_NAV = [
  { label: 'All Notes', filter: 'all' as const, Icon: FileText },
  { label: 'Favorites', filter: 'favorites' as const, Icon: Star },
]

const SECTION_GROUPS: { label: string; type: string; Icon: ComponentType<IconProps> }[] = [
  { label: 'Projects', type: 'Project', Icon: Wrench },
  { label: 'Experiments', type: 'Experiment', Icon: Flask },
  { label: 'Responsibilities', type: 'Responsibility', Icon: Target },
  { label: 'Procedures', type: 'Procedure', Icon: ArrowsClockwise },
  { label: 'People', type: 'Person', Icon: Users },
  { label: 'Events', type: 'Event', Icon: CalendarBlank },
  { label: 'Topics', type: 'Topic', Icon: Tag },
  { label: 'Types', type: 'Type', Icon: StackSimple },
]

export const Sidebar = memo(function Sidebar({ entries, selection, onSelect, onSelectNote, modifiedCount = 0, onCommitPush }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggleSection = (type: string) => {
    setCollapsed((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const getSectionColor = (entry: VaultEntry) => getTypeColor(entry.isA ?? '')

  const isActive = (sel: SidebarSelection): boolean => {
    if (selection.kind !== sel.kind) return false
    if (sel.kind === 'filter' && selection.kind === 'filter') return sel.filter === selection.filter
    if (sel.kind === 'sectionGroup' && selection.kind === 'sectionGroup') return sel.type === selection.type
    if (sel.kind === 'entity' && selection.kind === 'entity') return sel.entry.path === selection.entry.path
    if (sel.kind === 'topic' && selection.kind === 'topic') return sel.entry.path === selection.entry.path
    return false
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-[var(--sidebar-border)] bg-sidebar text-sidebar-foreground" style={{ paddingTop: 38 } as React.CSSProperties}>
      {/* Native macOS title bar on top */}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto">
        {/* Top nav — All Notes + Favorites */}
        <div className="border-b border-border" style={{ padding: '4px 6px' }}>
          {TOP_NAV.map(({ label, filter, Icon }) => {
            const count = filter === 'all' ? entries.length : 0
            return (
              <div
                key={filter}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded transition-colors",
                  isActive({ kind: 'filter', filter })
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent"
                )}
                style={{ padding: '6px 16px', borderRadius: 4 }}
                onClick={() => onSelect({ kind: 'filter', filter })}
              >
                <Icon size={16} />
                <span className="flex-1 text-[13px] font-medium">{label}</span>
                {count > 0 && (
                  <span
                    className="flex items-center justify-center bg-primary text-primary-foreground"
                    style={{ height: 20, borderRadius: 9999, padding: '0 6px', fontSize: 10 }}
                  >
                    {count}
                  </span>
                )}
              </div>
            )
          })}
          {/* Disabled placeholders */}
          <div
            className="flex select-none items-center gap-2 rounded text-foreground"
            style={{ padding: '6px 16px', borderRadius: 4, opacity: 0.4, cursor: 'not-allowed' }}
            title="Coming soon"
          >
            <TagSimple size={16} />
            <span className="flex-1 text-[13px] font-medium">Untagged</span>
          </div>
          <div
            className="flex select-none items-center gap-2 rounded text-foreground"
            style={{ padding: '6px 16px', borderRadius: 4, opacity: 0.4, cursor: 'not-allowed' }}
            title="Coming soon"
          >
            <Trash size={16} />
            <span className="flex-1 text-[13px] font-medium">Trash</span>
          </div>
        </div>

        {/* Section Groups */}
        {SECTION_GROUPS.map(({ label, type, Icon }) => {
          const items = type === 'Topic'
            ? entries.filter((e) => e.isA === 'Topic')
            : entries.filter((e) => e.isA === type)
          const isCollapsed = collapsed[type] ?? false
          const isTopic = type === 'Topic'

          return (
            <div key={type} style={{ padding: '4px 6px' }}>
              {/* Section header row */}
              <div
                className={cn(
                  "flex cursor-pointer select-none items-center justify-between rounded transition-colors",
                  isActive({ kind: 'sectionGroup', type })
                    ? "bg-secondary"
                    : "hover:bg-accent"
                )}
                style={{ padding: '6px 16px', borderRadius: 4, gap: 8 }}
                onClick={() => onSelect({ kind: 'sectionGroup', type })}
              >
                <div className="flex items-center" style={{ gap: 8 }}>
                  <Icon size={16} style={{ color: getTypeColor(type) }} />
                  <span className="text-[13px] font-medium text-foreground">{label}</span>
                </div>
                <button
                  className="flex shrink-0 items-center border-none bg-transparent p-0 text-inherit cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSection(type)
                  }}
                  aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Children items */}
              {!isCollapsed && items.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map((entry) => (
                    <div
                      key={entry.path}
                      className={cn(
                        "cursor-pointer truncate rounded-md text-[13px] font-normal transition-colors",
                        isActive(isTopic ? { kind: 'topic', entry } : { kind: 'entity', entry })
                          ? "text-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                      style={{
                        padding: '4px 16px 4px 28px',
                        ...(isActive(isTopic ? { kind: 'topic', entry } : { kind: 'entity', entry }) && {
                          backgroundColor: getTypeLightColor(entry.isA ?? ''),
                          color: getSectionColor(entry),
                        }),
                      }}
                      onClick={() => {
                        onSelect(isTopic ? { kind: 'topic', entry } : { kind: 'entity', entry })
                        onSelectNote?.(entry)
                      }}
                    >
                      {entry.title}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Commit button — always visible */}
      {onCommitPush && (
        <div className="shrink-0 border-t border-border" style={{ padding: 12 }}>
          <button
            className="flex w-full items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            style={{ borderRadius: 6, gap: 6, padding: '8px 16px', border: 'none', cursor: 'pointer' }}
            onClick={onCommitPush}
          >
            <GitCommitHorizontal size={14} />
            <span className="text-[13px] font-medium">Commit & Push</span>
            {modifiedCount > 0 && (
              <span
                className="text-white font-semibold"
                style={{ background: '#ffffff40', borderRadius: 9, padding: '0 6px', fontSize: 10 }}
              >
                {modifiedCount}
              </span>
            )}
          </button>
        </div>
      )}
    </aside>
  )
})
