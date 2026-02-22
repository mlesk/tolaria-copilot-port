import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { Editor } from './components/Editor'
import { ResizeHandle } from './components/ResizeHandle'
import { CreateNoteDialog } from './components/CreateNoteDialog'
import { CreateTypeDialog } from './components/CreateTypeDialog'
import { QuickOpenPalette } from './components/QuickOpenPalette'
import { Toast } from './components/Toast'
import { CommitDialog } from './components/CommitDialog'
import { StatusBar } from './components/StatusBar'
import { useVaultLoader } from './hooks/useVaultLoader'
import { useNoteActions } from './hooks/useNoteActions'
import { useAppKeyboard } from './hooks/useAppKeyboard'
import { isTauri } from './mock-tauri'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import type { SidebarSelection, GitCommit } from './types'
import './App.css'

// Type declaration for mock content storage
declare global {
  interface Window {
    __mockContent?: Record<string, string>
  }
}

const DEFAULT_SELECTION: SidebarSelection = { kind: 'filter', filter: 'all' }

// In web/browser mode: only Demo v2 (no real vault access)
// In native Tauri mode: Demo v2 + real Laputa vault
const VAULTS = isTauri()
  ? [
      { label: 'Demo v2', path: '/Users/luca/Workspace/laputa-app/demo-vault-v2' },
      { label: 'Laputa', path: '/Users/luca/Laputa' },
    ]
  : [
      { label: 'Demo v2', path: '/Users/luca/Workspace/laputa-app/demo-vault-v2' },
    ]

const BUILT_IN_TYPE_NAMES = new Set([
  'Project', 'Experiment', 'Responsibility', 'Procedure',
  'Person', 'Event', 'Topic', 'Type', 'Note', 'Essay',
  'Quarter', 'Journal', 'Evergreen',
])

function App() {
  const [selection, setSelection] = useState<SidebarSelection>(DEFAULT_SELECTION)
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [noteListWidth, setNoteListWidth] = useState(300)
  const [inspectorWidth, setInspectorWidth] = useState(280)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [gitHistory, setGitHistory] = useState<GitCommit[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createNoteDefaultType, setCreateNoteDefaultType] = useState<string | undefined>()
  const [showCreateTypeDialog, setShowCreateTypeDialog] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [vaultPath, setVaultPath] = useState(VAULTS[0].path)
  const [showAIChat, setShowAIChat] = useState(false)

  const vault = useVaultLoader(vaultPath)
  const notes = useNoteActions(vault.addEntry, vault.updateContent, vault.entries, setToastMessage)

  // Derive custom types from vault (Type entries not in built-in list)
  const customTypes = useMemo(
    () => vault.entries
      .filter((e) => e.isA === 'Type' && !BUILT_IN_TYPE_NAMES.has(e.title))
      .map((e) => e.title)
      .sort(),
    [vault.entries],
  )

  // Reset UI state when vault changes
  const handleSwitchVault = useCallback((path: string) => {
    setVaultPath(path)
    setSelection(DEFAULT_SELECTION)
    setGitHistory([])
    notes.closeAllTabs()
  }, [notes])

  // Load git history when active tab changes
  useEffect(() => {
    if (!notes.activeTabPath) {
      setGitHistory([])
      return
    }
    vault.loadGitHistory(notes.activeTabPath).then(setGitHistory)
  }, [notes.activeTabPath, vault.loadGitHistory])

  const openCreateDialog = useCallback((type?: string) => {
    setCreateNoteDefaultType(type)
    setShowCreateDialog(true)
  }, [])

  const openCreateTypeDialog = useCallback(() => {
    setShowCreateTypeDialog(true)
  }, [])

  const handleCreateType = useCallback((name: string) => {
    notes.handleCreateType(name)
    setToastMessage(`Type "${name}" created`)
  }, [notes, setToastMessage])

  const handleCustomizeType = useCallback((typeName: string, icon: string, color: string) => {
    const typeEntry = vault.entries.find((e) => e.isA === 'Type' && e.title === typeName)
    if (!typeEntry) return
    // Update icon and color in frontmatter (two separate calls)
    notes.handleUpdateFrontmatter(typeEntry.path, 'icon', icon)
    notes.handleUpdateFrontmatter(typeEntry.path, 'color', color)
    // Also update the entry in-memory for instant UI feedback
    vault.updateEntry(typeEntry.path, { icon, color })
  }, [vault, notes])

  const handleTrashNote = useCallback(async (path: string) => {
    const now = new Date().toISOString().slice(0, 10)
    await notes.handleUpdateFrontmatter(path, 'trashed', true)
    await notes.handleUpdateFrontmatter(path, 'trashed_at', now)
    vault.updateEntry(path, { trashed: true, trashedAt: Date.now() / 1000 })
    setToastMessage('Note moved to trash')
  }, [notes, vault, setToastMessage])

  const handleRestoreNote = useCallback(async (path: string) => {
    await notes.handleUpdateFrontmatter(path, 'trashed', false)
    await notes.handleDeleteProperty(path, 'trashed_at')
    vault.updateEntry(path, { trashed: false, trashedAt: null })
    setToastMessage('Note restored from trash')
  }, [notes, vault, setToastMessage])

  const handleArchiveNote = useCallback(async (path: string) => {
    await notes.handleUpdateFrontmatter(path, 'archived', true)
    vault.updateEntry(path, { archived: true })
    setToastMessage('Note archived')
  }, [notes, vault, setToastMessage])

  const handleUnarchiveNote = useCallback(async (path: string) => {
    await notes.handleUpdateFrontmatter(path, 'archived', false)
    vault.updateEntry(path, { archived: false })
    setToastMessage('Note unarchived')
  }, [notes, vault, setToastMessage])

  const handleReorderSections = useCallback((orderedTypes: { typeName: string; order: number }[]) => {
    for (const { typeName, order } of orderedTypes) {
      const typeEntry = vault.entries.find((e) => e.isA === 'Type' && e.title === typeName)
      if (!typeEntry) continue
      notes.handleUpdateFrontmatter(typeEntry.path, 'order', order)
      vault.updateEntry(typeEntry.path, { order })
    }
  }, [vault, notes])

  useAppKeyboard({
    onQuickOpen: () => setShowQuickOpen(true),
    onCreateNote: openCreateDialog,
    onSave: () => setToastMessage('Saved'),
    onTrashNote: handleTrashNote,
    onArchiveNote: handleArchiveNote,
    activeTabPathRef: notes.activeTabPathRef,
    handleCloseTabRef: notes.handleCloseTabRef,
  })

  useKeyboardNavigation({
    tabs: notes.tabs,
    activeTabPath: notes.activeTabPath,
    entries: vault.entries,
    selection,
    allContent: vault.allContent,
    onSwitchTab: notes.handleSwitchTab,
    onReplaceActiveTab: notes.handleReplaceActiveTab,
    onSelectNote: notes.handleSelectNote,
  })

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(150, Math.min(400, w + delta)))
  }, [])

  const handleNoteListResize = useCallback((delta: number) => {
    setNoteListWidth((w) => Math.max(200, Math.min(500, w + delta)))
  }, [])

  const handleInspectorResize = useCallback((delta: number) => {
    setInspectorWidth((w) => Math.max(200, Math.min(500, w - delta)))
  }, [])

  const handleCommitPush = useCallback(async (message: string) => {
    setShowCommitDialog(false)
    try {
      const result = await vault.commitAndPush(message)
      setToastMessage(result)
      vault.loadModifiedFiles()
    } catch (err) {
      console.error('Commit failed:', err)
      setToastMessage(`Commit failed: ${err}`)
    }
  }, [vault])

  const activeTab = notes.tabs.find((t) => t.entry.path === notes.activeTabPath) ?? null

  return (
    <div className="app-shell">
      <div className="app">
        <div className="app__sidebar" style={{ width: sidebarWidth }}>
          <Sidebar entries={vault.entries} selection={selection} onSelect={setSelection} onSelectNote={notes.handleSelectNote} onCreateType={openCreateDialog} onCreateNewType={openCreateTypeDialog} onCustomizeType={handleCustomizeType} onReorderSections={handleReorderSections} modifiedCount={vault.modifiedFiles.length} onCommitPush={() => setShowCommitDialog(true)} />
        </div>
        <ResizeHandle onResize={handleSidebarResize} />
        <div className="app__note-list" style={{ width: noteListWidth }}>
          <NoteList entries={vault.entries} selection={selection} selectedNote={activeTab?.entry ?? null} allContent={vault.allContent} modifiedFiles={vault.modifiedFiles} onSelectNote={notes.handleSelectNote} onCreateNote={openCreateDialog} />
        </div>
        <ResizeHandle onResize={handleNoteListResize} />
        <div className="app__editor">
          <Editor
            tabs={notes.tabs}
            activeTabPath={notes.activeTabPath}
            entries={vault.entries}
            onSwitchTab={notes.handleSwitchTab}
            onCloseTab={notes.handleCloseTab}
            onReorderTabs={notes.handleReorderTabs}
            onNavigateWikilink={notes.handleNavigateWikilink}
            onLoadDiff={vault.loadDiff}
            onLoadDiffAtCommit={vault.loadDiffAtCommit}
            isModified={vault.isFileModified}
            onCreateNote={openCreateDialog}
            inspectorCollapsed={inspectorCollapsed}
            onToggleInspector={() => setInspectorCollapsed((c) => !c)}
            inspectorWidth={inspectorWidth}
            onInspectorResize={handleInspectorResize}
            inspectorEntry={activeTab?.entry ?? null}
            inspectorContent={activeTab?.content ?? null}
            allContent={vault.allContent}
            gitHistory={gitHistory}
            onUpdateFrontmatter={notes.handleUpdateFrontmatter}
            onDeleteProperty={notes.handleDeleteProperty}
            onAddProperty={notes.handleAddProperty}
            showAIChat={showAIChat}
            onToggleAIChat={() => setShowAIChat(c => !c)}
            vaultPath={vaultPath}
            onTrashNote={handleTrashNote}
            onRestoreNote={handleRestoreNote}
            onArchiveNote={handleArchiveNote}
            onUnarchiveNote={handleUnarchiveNote}
          />
        </div>
      </div>
      <StatusBar noteCount={vault.entries.length} vaultPath={vaultPath} vaults={VAULTS} onSwitchVault={handleSwitchVault} />
      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      <QuickOpenPalette
        open={showQuickOpen}
        entries={vault.entries}
        onSelect={notes.handleSelectNote}
        onClose={() => setShowQuickOpen(false)}
      />
      <CreateNoteDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onCreate={notes.handleCreateNote}
        defaultType={createNoteDefaultType}
        customTypes={customTypes}
      />
      <CreateTypeDialog
        open={showCreateTypeDialog}
        onClose={() => setShowCreateTypeDialog(false)}
        onCreate={handleCreateType}
      />
      <CommitDialog
        open={showCommitDialog}
        modifiedCount={vault.modifiedFiles.length}
        onCommit={handleCommitPush}
        onClose={() => setShowCommitDialog(false)}
      />
    </div>
  )
}

export default App
