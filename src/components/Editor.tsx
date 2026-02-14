import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { livePreview } from './livePreview'
import { frontmatterHide, findFrontmatter } from './frontmatterHide'
import { wikilinks } from './wikilinks'
import type { VaultEntry } from '../types'
import './Editor.css'

interface Tab {
  entry: VaultEntry
  content: string
}

interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  onSwitchTab: (path: string) => void
  onCloseTab: (path: string) => void
  onNavigateWikilink: (target: string) => void
}

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '16px 0',
  },
  '.cm-content': {
    padding: '0 24px',
    maxWidth: '800px',
  },
  '.cm-gutters': {
    background: '#0f0f1a',
    border: 'none',
    color: '#444',
  },
  '.cm-activeLineGutter': {
    background: '#1a1a2e',
  },
  '.cm-activeLine': {
    background: '#1a1a2e',
  },
  '.cm-cursor': {
    borderLeftColor: '#e0e0e0',
  },
  '.cm-selectionBackground': {
    background: '#2a2a5a !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: '#2a2a5a !important',
  },
})

export function Editor({ tabs, activeTabPath, onSwitchTab, onCloseTab, onNavigateWikilink }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const navigateRef = useRef(onNavigateWikilink)
  navigateRef.current = onNavigateWikilink

  const activeTab = tabs.find((t) => t.entry.path === activeTabPath) ?? null

  // Create/destroy editor view when active tab changes
  useEffect(() => {
    if (!containerRef.current || !activeTab) return

    // If view already exists for this tab, skip
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    // Place cursor after frontmatter so it starts hidden
    const fmRange = findFrontmatter(activeTab.content)
    const initialCursor = fmRange ? fmRange[1] : 0

    const state = EditorState.create({
      doc: activeTab.content,
      selection: { anchor: initialCursor },
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        editorTheme,
        livePreview(),
        frontmatterHide(),
        wikilinks((target) => navigateRef.current(target)),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  // Re-create when active tab path changes OR when tab data becomes available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabPath, activeTab?.content])

  if (tabs.length === 0) {
    return (
      <div className="editor">
        <div className="editor__placeholder">
          <p>Select a note to start editing</p>
          <span className="editor__placeholder-hint">Cmd+P to search &middot; Cmd+N to create</span>
        </div>
      </div>
    )
  }

  return (
    <div className="editor">
      <div className="editor__tab-bar">
        {tabs.map((tab) => (
          <div
            key={tab.entry.path}
            className={`editor__tab${tab.entry.path === activeTabPath ? ' editor__tab--active' : ''}`}
            onClick={() => onSwitchTab(tab.entry.path)}
          >
            <span className="editor__tab-title">{tab.entry.title}</span>
            <button
              className="editor__tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.entry.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="editor__cm-container" ref={containerRef} />
    </div>
  )
}
