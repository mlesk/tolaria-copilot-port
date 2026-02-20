import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NoteList } from './NoteList'
import type { VaultEntry, SidebarSelection } from '../types'

const allSelection: SidebarSelection = { kind: 'filter', filter: 'all' }
const noopSelect = vi.fn()

const mockEntries: VaultEntry[] = [
  {
    path: '/Users/luca/Laputa/project/26q1-laputa-app.md',
    filename: '26q1-laputa-app.md',
    title: 'Build Laputa App',
    isA: 'Project',
    aliases: [],
    belongsTo: [],
    relatedTo: ['[[topic/software-development]]'],
    status: 'Active',
    owner: 'Luca',
    cadence: null,
    modifiedAt: 1700000000,
    createdAt: null,
    fileSize: 1024,
    snippet: 'Build a personal knowledge management app.',
    relationships: {
      'Related to': ['[[topic/software-development]]'],
    },
  },
  {
    path: '/Users/luca/Laputa/note/facebook-ads-strategy.md',
    filename: 'facebook-ads-strategy.md',
    title: 'Facebook Ads Strategy',
    isA: 'Note',
    aliases: [],
    belongsTo: ['[[project/26q1-laputa-app]]'],
    relatedTo: ['[[topic/growth]]'],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    createdAt: null,
    fileSize: 847,
    snippet: 'Lookalike audiences convert 3x better.',
    relationships: {
      'Belongs to': ['[[project/26q1-laputa-app]]'],
      'Related to': ['[[topic/growth]]'],
    },
  },
  {
    path: '/Users/luca/Laputa/person/matteo-cellini.md',
    filename: 'matteo-cellini.md',
    title: 'Matteo Cellini',
    isA: 'Person',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    createdAt: null,
    fileSize: 320,
    snippet: 'Sponsorship manager.',
    relationships: {},
  },
  {
    path: '/Users/luca/Laputa/event/2026-02-14-kickoff.md',
    filename: '2026-02-14-kickoff.md',
    title: 'Kickoff Meeting',
    isA: 'Event',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    createdAt: null,
    fileSize: 512,
    snippet: 'Project kickoff meeting notes.',
    relationships: {},
  },
  {
    path: '/Users/luca/Laputa/topic/software-development.md',
    filename: 'software-development.md',
    title: 'Software Development',
    isA: 'Topic',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    createdAt: null,
    fileSize: 256,
    snippet: 'Frontend, backend, and systems programming.',
    relationships: {},
  },
]

describe('NoteList', () => {
  it('shows empty state when no entries', () => {
    render(<NoteList entries={[]} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByText('No notes found')).toBeInTheDocument()
  })

  it('renders all entries with All Notes filter', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    expect(screen.getByText('Matteo Cellini')).toBeInTheDocument()
  })

  it('filters by People (section group)', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'sectionGroup', type: 'Person' }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByText('Matteo Cellini')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
  })

  it('filters by Events (section group)', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'sectionGroup', type: 'Event' }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByText('Kickoff Meeting')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
  })

  it('filters by section group type', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'sectionGroup', type: 'Project' }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.queryByText('Matteo Cellini')).not.toBeInTheDocument()
  })

  it('shows entity pinned at top with grouped children', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'entity', entry: mockEntries[0] }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />
    )
    // Entity title appears in header and pinned card
    expect(screen.getAllByText('Build Laputa App').length).toBeGreaterThanOrEqual(1)
    // Child entry in "Children" group
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    // Unrelated entries not shown
    expect(screen.queryByText('Matteo Cellini')).not.toBeInTheDocument()
    // Group headers shown
    expect(screen.getByText('Children')).toBeInTheDocument()
    expect(screen.getByText('Related to')).toBeInTheDocument()
  })

  it('filters by topic (relatedTo references)', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'topic', entry: mockEntries[4] }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />
    )
    // Build Laputa App has relatedTo: [[topic/software-development]]
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.queryByText('Facebook Ads Strategy')).not.toBeInTheDocument()
  })

  it('shows search input when search icon is clicked', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    // Search is hidden by default
    expect(screen.queryByPlaceholderText('Search notes...')).not.toBeInTheDocument()
    // Click search icon to show it
    fireEvent.click(screen.getByTitle('Search notes'))
    expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument()
  })

  it('filters by search query (case-insensitive substring)', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    // Open search
    fireEvent.click(screen.getByTitle('Search notes'))
    const input = screen.getByPlaceholderText('Search notes...')
    fireEvent.change(input, { target: { value: 'facebook' } })
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
  })

  it('sorts entries by last modified descending', () => {
    const entriesWithDifferentDates: VaultEntry[] = [
      { ...mockEntries[0], modifiedAt: 1000, title: 'Oldest' },
      { ...mockEntries[1], modifiedAt: 3000, title: 'Newest', path: '/p2' },
      { ...mockEntries[2], modifiedAt: 2000, title: 'Middle', path: '/p3' },
    ]
    render(<NoteList entries={entriesWithDifferentDates} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    const titles = screen.getAllByText(/Oldest|Newest|Middle/)
    const titleTexts = titles.map((el) => el.textContent)
    expect(titleTexts).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  it('does not render type badge or status on note items', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    // Type badges like "Project", "Note" etc. should not appear as separate badge elements
    // The word "Project" should only appear in the ALL CAPS pill "PROJECTS 1", not as a standalone badge
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('header shows search and plus icons instead of count badge', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />)
    expect(screen.getByTitle('Search notes')).toBeInTheDocument()
    expect(screen.getByTitle('Create new note')).toBeInTheDocument()
  })

  it('context view shows backlinks from allContent', () => {
    const allContent = {
      [mockEntries[2].path]: 'Met with [[project/26q1-laputa-app]] team.',
    }
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'entity', entry: mockEntries[0] }} selectedNote={null} onSelectNote={noopSelect} allContent={allContent} onCreateNote={vi.fn()} />
    )
    expect(screen.getByText('Backlinks')).toBeInTheDocument()
    expect(screen.getByText('Matteo Cellini')).toBeInTheDocument()
  })

  it('context view collapses and expands groups', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'entity', entry: mockEntries[0] }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />
    )
    // Children group is expanded by default
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    // Click the Children header to collapse
    fireEvent.click(screen.getByText('Children'))
    // Items should be hidden
    expect(screen.queryByText('Facebook Ads Strategy')).not.toBeInTheDocument()
    // Click again to expand
    fireEvent.click(screen.getByText('Children'))
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
  })

  it('context view shows prominent card with entity snippet', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'entity', entry: mockEntries[0] }} selectedNote={null} onSelectNote={noopSelect} allContent={{}} onCreateNote={vi.fn()} />
    )
    // Snippet appears in the prominent card
    expect(screen.getByText('Build a personal knowledge management app.')).toBeInTheDocument()
  })
})
