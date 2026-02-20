import { useState, useMemo, useCallback, memo } from 'react'
// Virtuoso removed — flat list rendering used instead
import type { VaultEntry, SidebarSelection, ModifiedFile } from '../types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  MagnifyingGlass, Plus, Wrench, Flask, Target, ArrowsClockwise,
  Users, CalendarBlank, Tag, FileText, CaretDown, CaretRight, StackSimple,
} from '@phosphor-icons/react'
import type { ComponentType, SVGAttributes } from 'react'
import { getTypeColor, getTypeLightColor } from '../utils/typeColors'

const TYPE_ICON_MAP: Record<string, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  Project: Wrench,
  Experiment: Flask,
  Responsibility: Target,
  Procedure: ArrowsClockwise,
  Person: Users,
  Event: CalendarBlank,
  Topic: Tag,
  Type: StackSimple,
}

function getTypeIcon(isA: string | null): ComponentType<SVGAttributes<SVGSVGElement>> {
  return (isA && TYPE_ICON_MAP[isA]) || FileText
}

interface NoteListProps {
  entries: VaultEntry[]
  selection: SidebarSelection
  selectedNote: VaultEntry | null
  allContent: Record<string, string>
  modifiedFiles?: ModifiedFile[]
  onSelectNote: (entry: VaultEntry) => void
  onCreateNote: () => void
}

interface RelationshipGroup {
  label: string
  entries: VaultEntry[]
}

function relativeDate(ts: number | null): string {
  if (!ts) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 0) {
    const date = new Date(ts * 1000)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  const date = new Date(ts * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDisplayDate(entry: VaultEntry): number | null {
  return entry.modifiedAt ?? entry.createdAt
}

function refsMatch(refs: string[], entry: VaultEntry): boolean {
  const stem = entry.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  const fileStem = entry.filename.replace(/\.md$/, '')
  return refs.some((ref) => {
    const raw = ref.replace(/^\[\[/, '').replace(/\]\]$/, '')
    const inner = raw.split('|')[0]
    return inner === stem || inner.split('/').pop() === fileStem
  })
}

function resolveRefs(refs: string[], entries: VaultEntry[]): VaultEntry[] {
  return refs
    .map((ref) => {
      // Strip [[ ]] and remove alias (|display text) if present
      const raw = ref.replace(/^\[\[/, '').replace(/\]\]$/, '')
      const inner = raw.split('|')[0]
      return entries.find((e) => {
        const stem = e.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
        if (stem === inner) return true
        const fileStem = e.filename.replace(/\.md$/, '')
        if (fileStem === inner.split('/').pop()) return true
        return false
      })
    })
    .filter((e): e is VaultEntry => e !== undefined)
}

function sortByModified(a: VaultEntry, b: VaultEntry): number {
  return (getDisplayDate(b) ?? 0) - (getDisplayDate(a) ?? 0)
}

function findBacklinks(entity: VaultEntry, allEntries: VaultEntry[], allContent: Record<string, string>): VaultEntry[] {
  const stem = entity.filename.replace(/\.md$/, '')
  const pathStem = entity.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  const targets = [entity.title, ...entity.aliases]

  return allEntries.filter((e) => {
    if (e.path === entity.path) return false
    const content = allContent[e.path]
    if (!content) return false
    for (const t of targets) {
      if (content.includes(`[[${t}]]`)) return true
    }
    if (content.includes(`[[${stem}]]`)) return true
    if (content.includes(`[[${pathStem}]]`)) return true
    if (content.includes(`[[${pathStem}|`)) return true
    return false
  })
}

function addGroup(
  groups: RelationshipGroup[],
  label: string,
  entries: VaultEntry[],
  seen: Set<string>,
) {
  const unseen = entries.filter((e) => !seen.has(e.path))
  if (unseen.length > 0) {
    groups.push({ label, entries: unseen })
    unseen.forEach((e) => seen.add(e.path))
  }
}

function buildRelationshipGroups(
  entity: VaultEntry,
  allEntries: VaultEntry[],
  allContent: Record<string, string>,
): RelationshipGroup[] {
  const groups: RelationshipGroup[] = []
  const seen = new Set<string>([entity.path])
  const rels = entity.relationships ?? {}

  // 0. "Instances" — for type documents, show all entries of this type
  if (entity.isA === 'Type') {
    const instances = allEntries
      .filter((e) => e.isA === entity.title && !seen.has(e.path))
      .sort(sortByModified)
    addGroup(groups, 'Instances', instances, seen)
  }

  // 1. "Has" — from the entity's own relationships map
  const hasRefs = rels['Has'] ?? []
  if (hasRefs.length > 0) {
    addGroup(groups, 'Has', resolveRefs(hasRefs, allEntries).sort(sortByModified), seen)
  }

  // 2. Children — entries whose belongsTo points to this entity (reverse lookup, excluding events)
  const children = allEntries
    .filter((e) => !seen.has(e.path) && e.isA !== 'Event' && refsMatch(e.belongsTo, entity))
    .sort(sortByModified)
  addGroup(groups, 'Children', children, seen)

  // 3. Events — entities of type Event that reference this entity via belongsTo/relatedTo
  const events = allEntries
    .filter(
      (e) =>
        !seen.has(e.path) &&
        e.isA === 'Event' &&
        (refsMatch(e.belongsTo, entity) || refsMatch(e.relatedTo, entity))
    )
    .sort(sortByModified)
  addGroup(groups, 'Events', events, seen)

  // 4. "Topics" — from the entity's own relationships map
  const topicRefs = rels['Topics'] ?? []
  if (topicRefs.length > 0) {
    addGroup(groups, 'Topics', resolveRefs(topicRefs, allEntries).sort(sortByModified), seen)
  }

  // 5. All other generic relationship fields (alphabetically)
  const handledKeys = new Set(['Has', 'Topics'])
  const otherKeys = Object.keys(rels)
    .filter((k) => !handledKeys.has(k))
    .sort((a, b) => a.localeCompare(b))
  for (const key of otherKeys) {
    const refs = rels[key]
    if (refs && refs.length > 0) {
      addGroup(groups, key, resolveRefs(refs, allEntries).sort(sortByModified), seen)
    }
  }

  // 6. Referenced By — entries that reference this entity via relatedTo (reverse lookup)
  const referencedBy = allEntries
    .filter((e) => !seen.has(e.path) && e.isA !== 'Event' && refsMatch(e.relatedTo, entity))
    .sort(sortByModified)
  addGroup(groups, 'Referenced By', referencedBy, seen)

  // 7. Backlinks — always last
  const backlinks = findBacklinks(entity, allEntries, allContent)
    .filter((e) => !seen.has(e.path))
    .sort(sortByModified)
  addGroup(groups, 'Backlinks', backlinks, seen)

  return groups
}

function filterEntries(entries: VaultEntry[], selection: SidebarSelection, _modifiedFiles?: ModifiedFile[]): VaultEntry[] {
  switch (selection.kind) {
    case 'filter':
      switch (selection.filter) {
        case 'all':
          return entries
        case 'favorites':
          return []
      }
      break
    case 'sectionGroup':
      return entries.filter((e) => e.isA === selection.type)
    case 'entity':
      return []
    case 'topic': {
      const topic = selection.entry
      return entries.filter((e) => refsMatch(e.relatedTo, topic))
    }
  }
}

function NoteListInner({ entries, selection, selectedNote, allContent, modifiedFiles, onSelectNote, onCreateNote }: NoteListProps) {
  const [search, setSearch] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const isEntityView = selection.kind === 'entity'
  const isSectionGroup = selection.kind === 'sectionGroup'

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  // Find the type document for this section group (e.g., type/project.md for "Project")
  const typeDocument = useMemo(() => {
    if (!isSectionGroup) return null
    const typeName = (selection as { kind: 'sectionGroup'; type: string }).type
    return entries.find((e) => e.isA === 'Type' && e.title === typeName) ?? null
  }, [isSectionGroup, selection, entries])

  const entityGroups = useMemo(
    () => isEntityView ? buildRelationshipGroups(selection.entry, entries, allContent) : [],
    [isEntityView, selection, entries, allContent]
  )

  const filtered = useMemo(
    () => isEntityView ? [] : filterEntries(entries, selection, modifiedFiles),
    [entries, selection, modifiedFiles, isEntityView]
  )

  const sorted = useMemo(
    () => isEntityView ? [] : [...filtered].sort(sortByModified),
    [filtered, isEntityView]
  )

  const query = search.trim().toLowerCase()

  const searched = useMemo(
    () => query ? sorted.filter((e) => e.title.toLowerCase().includes(query)) : sorted,
    [sorted, query]
  )

  const searchedGroups = useMemo(
    () => query
      ? entityGroups
          .map((g) => ({
            ...g,
            entries: g.entries.filter((e) => e.title.toLowerCase().includes(query)),
          }))
          .filter((g) => g.entries.length > 0)
      : entityGroups,
    [entityGroups, query]
  )


  const renderItem = useCallback((entry: VaultEntry, isPinned = false) => {
    const isSelected = selectedNote?.path === entry.path && !isPinned
    const typeColor = getTypeColor(entry.isA ?? '')
    const typeLightColor = getTypeLightColor(entry.isA ?? '')
    const TypeIcon = getTypeIcon(entry.isA)
    return (
      <div
        key={entry.path}
        className={cn(
          "relative cursor-pointer border-b border-[var(--border)] transition-colors",
          isPinned && "border-l-[3px] border-l-[var(--accent-green)] bg-muted",
          isSelected && "border-l-[3px]",
          !isPinned && !isSelected && "hover:bg-muted"
        )}
        style={{
          padding: isPinned || isSelected ? '14px 16px 14px 13px' : '14px 16px',
          ...(isSelected && {
            borderLeftColor: typeColor,
            backgroundColor: typeLightColor,
          }),
        }}
        onClick={() => onSelectNote(entry)}
      >
        <TypeIcon
          width={14}
          height={14}
          className="absolute right-3 top-2.5"
          style={{ color: typeColor }}
          data-testid="type-icon"
        />
        <div className="pr-5">
          <div className={cn(
            "truncate text-[13px] text-foreground",
            isSelected ? "font-semibold" : "font-medium"
          )}>
            {entry.title}
          </div>
        </div>
        <div className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {entry.snippet}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {relativeDate(getDisplayDate(entry))}
        </div>
      </div>
    )
  }, [selectedNote?.path, onSelectNote])

  const renderPinnedView = useCallback((entity: VaultEntry, groups: RelationshipGroup[]) => {
    const entityTypeColor = getTypeColor(entity.isA ?? '')
    const entityLightColor = getTypeLightColor(entity.isA ?? '')
    const EntityIcon = getTypeIcon(entity.isA)
    return (
      <div className="h-full overflow-y-auto">
        {/* Prominent card */}
        <div
          className="relative cursor-pointer border-b border-[var(--border)]"
          style={{ backgroundColor: entityLightColor, padding: '14px 16px' }}
          onClick={() => onSelectNote(entity)}
        >
          <EntityIcon
            width={16}
            height={16}
            className="absolute right-3 top-3.5"
            style={{ color: entityTypeColor }}
            data-testid="type-icon"
          />
          <div className="pr-6 text-[14px] font-bold" style={{ color: entityTypeColor }}>
            {entity.title}
          </div>
          <div className="mt-1 text-[12px] leading-[1.5] opacity-80" style={{ color: entityTypeColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entity.snippet}
          </div>
          <div className="mt-1 text-[11px] opacity-60" style={{ color: entityTypeColor }}>
            {relativeDate(getDisplayDate(entity))}
          </div>
        </div>

        {/* Relationship groups */}
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {query ? 'No matching items' : 'No related items'}
          </div>
        ) : (
          groups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label)
            return (
              <div key={group.label}>
                <button
                  className="flex w-full items-center justify-between border-none bg-muted cursor-pointer"
                  style={{ height: 32, padding: '0 16px' }}
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono-label text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="font-mono-label text-muted-foreground" style={{ fontWeight: 400 }}>{group.entries.length}</span>
                  </span>
                  {isGroupCollapsed
                    ? <CaretRight size={12} className="text-muted-foreground" />
                    : <CaretDown size={12} className="text-muted-foreground" />
                  }
                </button>
                {!isGroupCollapsed && group.entries.map((groupEntry) => renderItem(groupEntry))}
              </div>
            )
          })
        )}
      </div>
    )
  }, [onSelectNote, query, collapsedGroups, toggleGroup, renderItem])

  return (
    <div className="flex flex-col overflow-hidden border-r border-border bg-card text-foreground" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-4" data-tauri-drag-region style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h3 className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold">
          {isEntityView ? selection.entry.title : (typeDocument ? typeDocument.title : 'Notes')}
        </h3>
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => { setSearchVisible(!searchVisible); if (searchVisible) setSearch('') }}
            title="Search notes"
          >
            <MagnifyingGlass size={16} />
          </button>
          <button
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={onCreateNote}
            title="Create new note"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Search (toggle on icon click) */}
      {searchVisible && (
        <div className="border-b border-border px-3 py-2">
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px]"
            autoFocus
          />
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {isEntityView ? (() => {
          const entity = selection.entry
          return renderPinnedView(entity, searchedGroups)
        })() : (
          <div className="h-full overflow-y-auto">
            {/* Type document pinned card (for sectionGroup view) */}
            {typeDocument && (() => {
              const tdColor = getTypeColor(typeDocument.isA ?? 'Type')
              const tdLightColor = getTypeLightColor(typeDocument.isA ?? 'Type')
              const TDIcon = getTypeIcon(typeDocument.isA)
              return (
                <div
                  className="relative cursor-pointer border-b border-[var(--border)]"
                  style={{ backgroundColor: tdLightColor, padding: '14px 16px' }}
                  onClick={() => onSelectNote(typeDocument)}
                >
                  <TDIcon
                    width={16}
                    height={16}
                    className="absolute right-3 top-3.5"
                    style={{ color: tdColor }}
                    data-testid="type-icon"
                  />
                  <div className="pr-6 text-[14px] font-bold" style={{ color: tdColor }}>
                    {typeDocument.title}
                  </div>
                  <div className="mt-1 text-[12px] leading-[1.5] opacity-80" style={{ color: tdColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {typeDocument.snippet}
                  </div>
                </div>
              )
            })()}
            {searched.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">No notes found</div>
            ) : (
              searched.map((entry) => renderItem(entry))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const NoteList = memo(NoteListInner)
