import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BreadcrumbBar } from './BreadcrumbBar'
import type { VaultEntry } from '../types'

const baseEntry: VaultEntry = {
  path: '/vault/note/test.md',
  filename: 'test.md',
  title: 'Test Note',
  isA: 'Note',
  aliases: [],
  belongsTo: [],
  relatedTo: [],
  status: null,
  owner: null,
  cadence: null,
  archived: false,
  trashed: false,
  trashedAt: null,
  modifiedAt: 1700000000,
  createdAt: null,
  fileSize: 100,
  snippet: '',
  relationships: {},
  icon: null,
  color: null,
  order: null,
}

const trashedEntry: VaultEntry = {
  ...baseEntry,
  trashed: true,
  trashedAt: Date.now() / 1000 - 86400 * 5,
}

const defaultProps = {
  wordCount: 100,
  isModified: false,
  showDiffToggle: false,
  diffMode: false,
  diffLoading: false,
  onToggleDiff: vi.fn(),
}

describe('BreadcrumbBar — trash/restore', () => {
  it('shows trash button for non-trashed note', () => {
    render(<BreadcrumbBar entry={baseEntry} {...defaultProps} onTrash={vi.fn()} onRestore={vi.fn()} />)
    expect(screen.getByTitle('Move to trash (Cmd+Delete)')).toBeInTheDocument()
    expect(screen.queryByTitle('Restore from trash')).not.toBeInTheDocument()
  })

  it('shows restore button for trashed note', () => {
    render(<BreadcrumbBar entry={trashedEntry} {...defaultProps} onTrash={vi.fn()} onRestore={vi.fn()} />)
    expect(screen.getByTitle('Restore from trash')).toBeInTheDocument()
    expect(screen.queryByTitle('Move to trash (Cmd+Delete)')).not.toBeInTheDocument()
  })

  it('calls onTrash when trash button is clicked', () => {
    const onTrash = vi.fn()
    render(<BreadcrumbBar entry={baseEntry} {...defaultProps} onTrash={onTrash} onRestore={vi.fn()} />)
    fireEvent.click(screen.getByTitle('Move to trash (Cmd+Delete)'))
    expect(onTrash).toHaveBeenCalledOnce()
  })

  it('calls onRestore when restore button is clicked', () => {
    const onRestore = vi.fn()
    render(<BreadcrumbBar entry={trashedEntry} {...defaultProps} onTrash={vi.fn()} onRestore={onRestore} />)
    fireEvent.click(screen.getByTitle('Restore from trash'))
    expect(onRestore).toHaveBeenCalledOnce()
  })
})
