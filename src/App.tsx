import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { NoteList } from './components/NoteList'
import { Editor } from './components/Editor'
import { ResizeHandle } from './components/ResizeHandle'
import { CreateNoteDialog } from './components/CreateNoteDialog'
import { QuickOpenPalette } from './components/QuickOpenPalette'
import { Toast } from './components/Toast'
import { CommitDialog } from './components/CommitDialog'
import { StatusBar } from './components/StatusBar'
import { useVaultLoader } from './hooks/useVaultLoader'
import { useNoteActions } from './hooks/useNoteActions'
import { useAppKeyboard } from './hooks/useAppKeyboard'
import type { SidebarSelection, GitCommit } from './types'
import './App.css'

// Type declaration for mock content storage
declare global {
  interface Window {
    __mockContent?: Record<string, string>
  }
}

const DEFAULT_SELECTION: SidebarSelection = { kind: 'filter', filter: 'all' }

const VAULTS = [
  { label: 'Demo v2', path: '/Users/luca/Workspace/laputa-app/demo-vault-v2' },
  { label: 'Laputa', path: '/Users/luca/Laputa' },
  { label: 'Demo', path: '/Users/luca/Workspace/laputa-app/demo-vault' },
]

function App() {
  const [selection, setSelection] = useState<SidebarSelection>(DEFAULT_SELECTION)
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [noteListWidth, setNoteListWidth] = useState(300)
  const [inspectorWidth, setInspectorWidth] = useState(280)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [gitHistory, setGitHistory] = useState<GitCommit[]>([])
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [vaultPath, setVaultPath] = useState(VAULTS[0].path)
  const [showAIChat, setShowAIChat] = useState(false)

  const vault = useVaultLoader(vaultPath)
  const notes = useNoteActions(vault.addEntry, vault.updateContent, vault.entries, setToastMessage)

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

  useAppKeyboard({
    onQuickOpen: () => setShowQuickOpen(true),
    onCreateNote: () => setShowCreateDialog(true),
    onSave: () => setToastMessage('Saved'),
    activeTabPathRef: notes.activeTabPathRef,
    handleCloseTabRef: notes.handleCloseTabRef,
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
          <Sidebar entries={vault.entries} selection={selection} onSelect={setSelection} onSelectNote={notes.handleSelectNote} modifiedCount={vault.modifiedFiles.length} onCommitPush={() => setShowCommitDialog(true)} />
        </div>
        <ResizeHandle onResize={handleSidebarResize} />
        <div className="app__note-list" style={{ width: noteListWidth }}>
          <NoteList entries={vault.entries} selection={selection} selectedNote={activeTab?.entry ?? null} allContent={vault.allContent} modifiedFiles={vault.modifiedFiles} onSelectNote={notes.handleSelectNote} onCreateNote={() => setShowCreateDialog(true)} />
        </div>
        <ResizeHandle onResize={handleNoteListResize} />
        <div className="app__editor">
          <Editor
            tabs={notes.tabs}
            activeTabPath={notes.activeTabPath}
            entries={vault.entries}
            onSwitchTab={notes.handleSwitchTab}
            onCloseTab={notes.handleCloseTab}
            onNavigateWikilink={notes.handleNavigateWikilink}
            onLoadDiff={vault.loadDiff}
            isModified={vault.isFileModified}
            onCreateNote={() => setShowCreateDialog(true)}
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
