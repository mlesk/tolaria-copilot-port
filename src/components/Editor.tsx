import { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react'
import { BlockNoteSchema, defaultInlineContentSpecs } from '@blocknote/core'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import { createReactInlineContentSpec, useCreateBlockNote, SuggestionMenuController } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import type { VaultEntry, GitCommit } from '../types'
import { Inspector, type FrontmatterValue } from './Inspector'
import { AIChatPanel } from './AIChatPanel'
import { DiffView } from './DiffView'
import { ResizeHandle } from './ResizeHandle'
import { TabBar } from './TabBar'
import { BreadcrumbBar } from './BreadcrumbBar'
import { useEditorTheme } from '../hooks/useTheme'
import { splitFrontmatter, preProcessWikilinks, injectWikilinks, countWords } from '../utils/wikilinks'
import './Editor.css'
import './EditorTheme.css'

interface Tab {
  entry: VaultEntry
  content: string
}

interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  entries: VaultEntry[]
  onSwitchTab: (path: string) => void
  onCloseTab: (path: string) => void
  onNavigateWikilink: (target: string) => void
  onLoadDiff?: (path: string) => Promise<string>
  isModified?: (path: string) => boolean
  onCreateNote?: () => void
  // Inspector props
  inspectorCollapsed: boolean
  onToggleInspector: () => void
  inspectorWidth: number
  onInspectorResize: (delta: number) => void
  inspectorEntry: VaultEntry | null
  inspectorContent: string | null
  allContent: Record<string, string>
  gitHistory: GitCommit[]
  onUpdateFrontmatter?: (path: string, key: string, value: FrontmatterValue) => Promise<void>
  onDeleteProperty?: (path: string, key: string) => Promise<void>
  onAddProperty?: (path: string, key: string, value: FrontmatterValue) => Promise<void>
  showAIChat?: boolean
  onToggleAIChat?: () => void
}

// --- Custom Inline Content: WikiLink ---

const WikiLink = createReactInlineContentSpec(
  {
    type: "wikilink" as const,
    propSchema: {
      target: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <span
        className="wikilink"
        data-target={props.inlineContent.props.target}
      >
        {props.inlineContent.props.target}
      </span>
    ),
  }
)

// --- Schema with wikilink ---

const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikiLink,
  },
})

/** Single BlockNote editor view — content is swapped via replaceBlocks */
function SingleEditorView({ editor, entries, onNavigateWikilink }: { editor: ReturnType<typeof useCreateBlockNote>; entries: VaultEntry[]; onNavigateWikilink: (target: string) => void }) {
  const navigateRef = useRef(onNavigateWikilink)
  navigateRef.current = onNavigateWikilink
  const { cssVars } = useEditorTheme()

  useEffect(() => {
    const container = document.querySelector('.editor__blocknote-container')
    if (!container) return
    const handler = (e: MouseEvent) => {
      const wikilink = (e.target as HTMLElement).closest('.wikilink')
      if (wikilink) {
        e.preventDefault()
        e.stopPropagation()
        const target = (wikilink as HTMLElement).dataset.target
        if (target) navigateRef.current(target)
      }
    }
    container.addEventListener('click', handler as EventListener, true)
    return () => container.removeEventListener('click', handler as EventListener, true)
  }, [editor])

  const baseItems = useMemo(
    () => entries.map(entry => ({
      title: entry.title,
      aliases: [entry.filename.replace(/\.md$/, ''), ...entry.aliases],
      group: entry.isA || 'Note',
      entryTitle: entry.title,
    })),
    [entries]
  )

  const getWikilinkItems = useCallback(async (query: string) => {
    const items = baseItems.map(item => ({
      ...item,
      onItemClick: () => {
        editor.insertInlineContent([
          {
            type: 'wikilink' as const,
            props: { target: item.entryTitle },
          },
          " ",
        ])
      },
    }))
    return filterSuggestionItems(items, query)
  }, [baseItems, editor])

  return (
    <div className="editor__blocknote-container" style={cssVars as React.CSSProperties}>
      <BlockNoteView
        editor={editor}
        theme="light"
      >
        <SuggestionMenuController
          triggerCharacter="[["
          getItems={getWikilinkItems}
        />
      </BlockNoteView>
    </div>
  )
}

export const Editor = memo(function Editor({
  tabs, activeTabPath, entries, onSwitchTab, onCloseTab, onNavigateWikilink, onLoadDiff, isModified, onCreateNote,
  inspectorCollapsed, onToggleInspector, inspectorWidth, onInspectorResize,
  inspectorEntry, inspectorContent, allContent, gitHistory,
  onUpdateFrontmatter, onDeleteProperty, onAddProperty,
  showAIChat, onToggleAIChat,
}: EditorProps) {
  const [diffMode, setDiffMode] = useState(false)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // Single editor instance — reused across all tabs
  const editor = useCreateBlockNote({ schema })
  // Cache parsed blocks per tab path for instant switching
  const tabCacheRef = useRef<Map<string, any[]>>(new Map())
  const prevActivePathRef = useRef<string | null>(null)
  const editorMountedRef = useRef(false)
  const pendingSwapRef = useRef<(() => void) | null>(null)

  // Track editor mount state
  useEffect(() => {
    // Check if already mounted (prosemirrorView exists)
    if (editor.prosemirrorView) {
      editorMountedRef.current = true
    }
    const cleanup = editor.onMount(() => {
      editorMountedRef.current = true
      // Execute any pending content swap that was queued before mount
      if (pendingSwapRef.current) {
        pendingSwapRef.current()
        pendingSwapRef.current = null
      }
    })
    return cleanup
  }, [editor])

  // Swap document content when active tab changes
  useEffect(() => {
    const cache = tabCacheRef.current
    const prevPath = prevActivePathRef.current

    // Save current editor state for the tab we're leaving
    if (prevPath && prevPath !== activeTabPath && editorMountedRef.current) {
      cache.set(prevPath, editor.document)
    }
    prevActivePathRef.current = activeTabPath

    if (!activeTabPath) return

    const tab = tabs.find(t => t.entry.path === activeTabPath)
    if (!tab) return

    const applyBlocks = (blocks: any[]) => {
      try {
        // Clear all current content and insert new blocks
        const current = editor.document
        if (current.length > 0 && blocks.length > 0) {
          editor.replaceBlocks(current, blocks)
        } else if (blocks.length > 0) {
          // Editor empty — insert at the beginning
          editor.insertBlocks(blocks, current[0], 'before')
        }
      } catch (err) {
        console.error('applyBlocks failed, trying fallback:', err)
        // Fallback: use tiptap's setContent via blocksToHTMLLossy
        try {
          const html = editor.blocksToHTMLLossy(blocks)
          editor._tiptapEditor.commands.setContent(html)
        } catch (err2) {
          console.error('Fallback also failed:', err2)
        }
      }
    }

    try {
      const doSwap = () => {
        if (cache.has(activeTabPath)) {
          applyBlocks(cache.get(activeTabPath)!)
        } else {
          const [, rawBody] = splitFrontmatter(tab.content)
          // Strip leading H1 title — it's already shown in the tab and breadcrumb
          const body = rawBody.replace(/^# [^\n]*\n?/, '').trimStart()
          const preprocessed = preProcessWikilinks(body)
          const targetPath = activeTabPath
          // tryParseMarkdownToBlocks may return a Promise or blocks directly
          const result = editor.tryParseMarkdownToBlocks(preprocessed)
          const handleBlocks = (blocks: any[]) => {
            const withWikilinks = injectWikilinks(blocks)
            if (prevActivePathRef.current !== targetPath) return
            cache.set(targetPath, withWikilinks)
            applyBlocks(withWikilinks)
          }
          if (result && typeof (result as any).then === 'function') {
            (result as unknown as Promise<any[]>).then(handleBlocks)
          } else {
            handleBlocks(result as any[])
          }
        }
      }

      // If editor is mounted, swap immediately. Otherwise wait for mount.
      if (editor.prosemirrorView) {
        doSwap()
      } else {
        pendingSwapRef.current = doSwap
      }
    } catch (err) {
      console.error('Failed to swap editor content:', err)
    }
  }, [activeTabPath, tabs, editor])

  // Clean up cache entries when tabs are closed
  const tabPathsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentPaths = new Set(tabs.map(t => t.entry.path))
    for (const path of tabPathsRef.current) {
      if (!currentPaths.has(path)) {
        tabCacheRef.current.delete(path)
      }
    }
    tabPathsRef.current = currentPaths
  }, [tabs])

  const activeTab = tabs.find((t) => t.entry.path === activeTabPath) ?? null
  const isLoadingNewTab = activeTabPath !== null && !activeTab
  const showDiffToggle = activeTab && isModified?.(activeTab.entry.path)

  useEffect(() => {
    setDiffMode(false)
    setDiffContent(null)
  }, [activeTabPath])

  const handleToggleDiff = useCallback(async () => {
    if (diffMode) {
      setDiffMode(false)
      setDiffContent(null)
      return
    }
    if (!activeTabPath || !onLoadDiff) return
    setDiffLoading(true)
    try {
      const diff = await onLoadDiff(activeTabPath)
      setDiffContent(diff)
      setDiffMode(true)
    } catch (err) {
      console.warn('Failed to load diff:', err)
    } finally {
      setDiffLoading(false)
    }
  }, [diffMode, activeTabPath, onLoadDiff])

  const activeModified = activeTab ? isModified?.(activeTab.entry.path) ?? false : false
  const wordCount = activeTab ? countWords(activeTab.content) : 0

  const tabBar = (
    <TabBar
      tabs={tabs}
      activeTabPath={activeTabPath}
      onSwitchTab={onSwitchTab}
      onCloseTab={onCloseTab}
      onCreateNote={onCreateNote}
    />
  )

  const breadcrumbBar = activeTab ? (
    <BreadcrumbBar
      entry={activeTab.entry}
      wordCount={wordCount}
      isModified={activeModified}
      showDiffToggle={!!showDiffToggle}
      diffMode={diffMode}
      diffLoading={diffLoading}
      onToggleDiff={handleToggleDiff}
      showAIChat={showAIChat}
      onToggleAIChat={onToggleAIChat}
    />
  ) : null

  const rightPanel = showAIChat ? (
    <div
      className="shrink-0 flex flex-col min-h-0"
      style={{ width: inspectorWidth, height: '100%' }}
    >
      <AIChatPanel
        entry={inspectorEntry}
        allContent={allContent}
        onClose={() => onToggleAIChat?.()}
      />
    </div>
  ) : (
    <div
      className="shrink-0 flex flex-col min-h-0"
      style={{ width: inspectorCollapsed ? 40 : inspectorWidth, height: '100%' }}
    >
      <Inspector
        collapsed={inspectorCollapsed}
        onToggle={onToggleInspector}
        entry={inspectorEntry}
        content={inspectorContent}
        entries={entries}
        allContent={allContent}
        gitHistory={gitHistory}
        onNavigate={onNavigateWikilink}
        onUpdateFrontmatter={onUpdateFrontmatter}
        onDeleteProperty={onDeleteProperty}
        onAddProperty={onAddProperty}
      />
    </div>
  )

  if (tabs.length === 0) {
    return (
      <div className="editor flex flex-col min-h-0 overflow-hidden bg-background text-foreground">
        {tabBar}
        <div className="flex flex-1 min-h-0">
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <p className="m-0 text-[15px]">Select a note to start editing</p>
            <span className="text-xs text-muted-foreground">Cmd+P to search &middot; Cmd+N to create</span>
          </div>
          {(showAIChat || !inspectorCollapsed) && <ResizeHandle onResize={onInspectorResize} />}
          {rightPanel}
        </div>
      </div>
    )
  }

  return (
    <div className="editor flex flex-col min-h-0 overflow-hidden bg-background text-foreground">
      {tabBar}
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          {breadcrumbBar}
          {diffMode && (
            <div className="flex-1 overflow-auto">
              <DiffView diff={diffContent ?? ''} />
            </div>
          )}
          {!diffMode && activeTab && (
            <div
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                minHeight: 0,
              }}
            >
              <SingleEditorView
                editor={editor}
                entries={entries}
                onNavigateWikilink={onNavigateWikilink}
              />
            </div>
          )}
          {isLoadingNewTab && !diffMode && (
            <div className="flex flex-1 flex-col gap-3 p-8 animate-pulse" style={{ minHeight: 0 }}>
              <div className="h-6 w-2/5 rounded bg-muted" />
              <div className="h-4 w-4/5 rounded bg-muted" />
              <div className="h-4 w-3/5 rounded bg-muted" />
              <div className="h-4 w-4/5 rounded bg-muted" />
              <div className="h-4 w-2/5 rounded bg-muted" />
            </div>
          )}
        </div>
        {(showAIChat || !inspectorCollapsed) && <ResizeHandle onResize={onInspectorResize} />}
        {rightPanel}
      </div>
    </div>
  )
})
