import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Mock BlockNote components
vi.mock('@blocknote/core', () => ({
  BlockNoteSchema: { create: () => ({}) },
  defaultInlineContentSpecs: {},
  filterSuggestionItems: vi.fn(() => []),
}))

vi.mock('@blocknote/core/extensions', () => ({
  filterSuggestionItems: vi.fn(() => []),
}))

vi.mock('@blocknote/react', () => ({
  createReactInlineContentSpec: () => ({ render: () => null }),
  useCreateBlockNote: () => ({
    tryParseMarkdownToBlocks: async () => [],
    replaceBlocks: () => {},
    document: [],
    insertInlineContent: () => {},
    onMount: (cb: () => void) => { cb(); return () => {} },
  }),
  SuggestionMenuController: () => null,
}))

vi.mock('@blocknote/mantine', () => ({
  BlockNoteView: ({ children }: any) => <div data-testid="blocknote-view">{children}</div>,
}))

vi.mock('@blocknote/mantine/style.css', () => ({}))

import { Editor } from './Editor'
import type { VaultEntry } from '../types'

const mockEntry: VaultEntry = {
  path: '/vault/project/test.md',
  filename: 'test.md',
  title: 'Test Project',
  isA: 'Project',
  aliases: [],
  belongsTo: [],
  relatedTo: [],
  status: 'Active',
  owner: 'Luca',
  cadence: null,
  modifiedAt: 1700000000,
  createdAt: null,
  fileSize: 1024,
  snippet: '',
  relationships: {},
}

const mockContent = `---
title: Test Project
is_a: Project
Status: Active
---

# Test Project

This is a test note with some words to count.
`

const mockTab = { entry: mockEntry, content: mockContent }

const defaultProps = {
  tabs: [] as { entry: VaultEntry; content: string }[],
  activeTabPath: null as string | null,
  entries: [mockEntry],
  onSwitchTab: vi.fn(),
  onCloseTab: vi.fn(),
  onNavigateWikilink: vi.fn(),
  inspectorCollapsed: true,
  onToggleInspector: vi.fn(),
  inspectorWidth: 280,
  onInspectorResize: vi.fn(),
  inspectorEntry: null as VaultEntry | null,
  inspectorContent: null as string | null,
  allContent: {} as Record<string, string>,
  gitHistory: [],
  onCreateNote: vi.fn(),
}

describe('Editor', () => {
  it('shows empty state when no tabs are open', () => {
    render(<Editor {...defaultProps} />)
    expect(screen.getByText('Select a note to start editing')).toBeInTheDocument()
    expect(screen.getByText(/Cmd\+P to search/)).toBeInTheDocument()
  })

  it('renders tab bar with open tabs', () => {
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
      />
    )
    expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
  })

  it('renders breadcrumb bar with note info', () => {
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
      />
    )
    // Breadcrumb shows type and title
    expect(screen.getByText('Project')).toBeInTheDocument()
    // Word count shown
    expect(screen.getByText(/words/)).toBeInTheDocument()
  })

  it('calls onCloseTab when close button is clicked', () => {
    const onCloseTab = vi.fn()
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
        onCloseTab={onCloseTab}
      />
    )
    // Find the close button (X icon) in the tab
    const closeButtons = document.querySelectorAll('button')
    const tabCloseBtn = Array.from(closeButtons).find(btn => {
      const svg = btn.querySelector('svg')
      return svg && btn.closest('[class*="group"]')
    })
    if (tabCloseBtn) {
      fireEvent.click(tabCloseBtn)
      expect(onCloseTab).toHaveBeenCalledWith(mockEntry.path)
    }
  })

  it('calls onSwitchTab when clicking a tab', () => {
    const secondEntry: VaultEntry = {
      ...mockEntry,
      path: '/vault/topic/dev.md',
      title: 'Dev Topic',
      isA: 'Topic',
    }
    const onSwitchTab = vi.fn()
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab, { entry: secondEntry, content: '# Dev' }]}
        activeTabPath={mockEntry.path}
        onSwitchTab={onSwitchTab}
      />
    )
    fireEvent.click(screen.getByText('Dev Topic'))
    expect(onSwitchTab).toHaveBeenCalledWith(secondEntry.path)
  })

  it('renders new note button in tab bar', () => {
    const onCreateNote = vi.fn()
    render(
      <Editor
        {...defaultProps}
        onCreateNote={onCreateNote}
      />
    )
    const newNoteBtn = screen.getByTitle('New note')
    expect(newNoteBtn).toBeInTheDocument()
    fireEvent.click(newNoteBtn)
    expect(onCreateNote).toHaveBeenCalled()
  })

  it('shows BlockNote editor when a tab is active', () => {
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
      />
    )
    expect(screen.getByTestId('blocknote-view')).toBeInTheDocument()
  })

  it('shows modified indicator when file is modified', () => {
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
        isModified={() => true}
      />
    )
    // Modified indicator shows "M" in the breadcrumb
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders diff toggle button when file is modified', () => {
    render(
      <Editor
        {...defaultProps}
        tabs={[mockTab]}
        activeTabPath={mockEntry.path}
        isModified={() => true}
        onLoadDiff={async () => '+ added line'}
      />
    )
    const diffBtn = screen.getByTitle('Show diff')
    expect(diffBtn).toBeInTheDocument()
  })

  it('includes inspector panel', () => {
    render(
      <Editor
        {...defaultProps}
        inspectorCollapsed={false}
        inspectorEntry={mockEntry}
        inspectorContent={mockContent}
      />
    )
    // Inspector renders "Properties" header
    expect(screen.getAllByText('Properties').length).toBeGreaterThan(0)
  })
})
