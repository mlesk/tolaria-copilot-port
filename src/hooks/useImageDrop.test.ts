import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { uploadImageFile, useImageDrop } from './useImageDrop'
import { createRef } from 'react'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}))

vi.mock('../mock-tauri', () => ({
  isTauri: () => false,
}))

// JSDOM lacks DragEvent and File.arrayBuffer — polyfill for tests
beforeAll(() => {
  if (typeof globalThis.DragEvent === 'undefined') {
    // @ts-expect-error polyfill for JSDOM
    globalThis.DragEvent = class DragEvent extends MouseEvent {
      dataTransfer: DataTransfer | null
      constructor(type: string, init?: DragEventInit) {
        super(type, init)
        this.dataTransfer = init?.dataTransfer ?? null
      }
    }
  }

  // File.prototype.arrayBuffer may be missing in older JSDOM
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})

// Mock DataTransfer (JSDOM doesn't implement it)
function createMockDataTransfer(files: File[]) {
  const items = files.map(f => ({ kind: 'file' as const, type: f.type, getAsFile: () => f }))
  return {
    items: { length: items.length, ...items },
    files: Object.assign(files, { item: (i: number) => files[i] }),
    dropEffect: 'none',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as DataTransfer
}

function createDragEvent(type: string, files: File[], opts?: { clientX?: number; clientY?: number; relatedTarget?: EventTarget | null }) {
  const dt = createMockDataTransfer(files)
  return new DragEvent(type, {
    dataTransfer: dt,
    bubbles: true,
    cancelable: true,
    clientX: opts?.clientX ?? 100,
    clientY: opts?.clientY ?? 200,
    relatedTarget: opts?.relatedTarget ?? null,
  })
}

describe('uploadImageFile', () => {
  it('returns a data URL in browser mode', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })

    const url = await uploadImageFile(file)
    expect(url).toMatch(/^data:image\/png;base64,/)
  })

  it('passes file to Tauri save_image in Tauri mode', async () => {
    const mockTauri = await import('../mock-tauri')
    const originalIsTauri = mockTauri.isTauri
    vi.mocked(mockTauri).isTauri = () => true as unknown as boolean

    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-test.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/123-test.png')

    const blob = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })

    const url = await uploadImageFile(file, '/vault')
    expect(invoke).toHaveBeenCalledWith('save_image', {
      vaultPath: '/vault',
      filename: 'test.png',
      data: expect.any(String),
    })
    expect(url).toBe('asset://localhost/vault/attachments/123-test.png')

    vi.mocked(mockTauri).isTauri = originalIsTauri
  })
})

describe('useImageDrop', () => {
  let container: HTMLDivElement
  let mockEditor: {
    _tiptapEditor: { view: { posAtCoords: vi.Mock }; commands: { setTextSelection: vi.Mock } }
    getTextCursorPosition: vi.Mock
    insertBlocks: vi.Mock
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)

    mockEditor = {
      _tiptapEditor: {
        view: { posAtCoords: vi.fn(() => ({ pos: 5 })) },
        commands: { setTextSelection: vi.fn() },
      },
      getTextCursorPosition: vi.fn(() => ({ block: { id: 'block-1' } })),
      insertBlocks: vi.fn(),
    }
  })

  afterEach(() => {
    container.remove()
  })

  function renderImageDrop(vaultPath?: string) {
    const ref = createRef<HTMLDivElement>()
    Object.defineProperty(ref, 'current', { value: container, writable: true })
    return renderHook(() => useImageDrop({ editor: mockEditor, containerRef: ref, vaultPath }))
  }

  it('sets isDragOver to true on dragover with image files', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(true)
  })

  it('ignores dragover with non-image files', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(false)
  })

  it('resets isDragOver on dragleave when leaving container', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(true)

    act(() => { container.dispatchEvent(createDragEvent('dragleave', [], { relatedTarget: document.body })) })
    expect(result.current.isDragOver).toBe(false)
  })

  it('uploads image and inserts block on drop', async () => {
    const { result } = renderImageDrop()
    const blob = new Blob(['fake-png'], { type: 'image/png' })
    const file = new File([blob], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('drop', [file])) })

    // The drop handler is async — wait for the upload + insert to complete
    await waitFor(() => {
      expect(mockEditor.insertBlocks).toHaveBeenCalledWith(
        [{ type: 'image', props: { url: expect.stringMatching(/^data:image\/png/) } }],
        { id: 'block-1' },
        'after',
      )
    })
    expect(result.current.isDragOver).toBe(false)
  })

  it('ignores drop with non-image files', async () => {
    renderImageDrop()
    const file = new File(['text'], 'readme.txt', { type: 'text/plain' })

    await act(async () => { container.dispatchEvent(createDragEvent('drop', [file])) })
    expect(mockEditor.insertBlocks).not.toHaveBeenCalled()
  })

  it('accepts jpeg, gif, and webp types', () => {
    const { result } = renderImageDrop()

    for (const type of ['image/jpeg', 'image/gif', 'image/webp']) {
      const file = new File(['data'], `img.${type.split('/')[1]}`, { type })
      act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
      expect(result.current.isDragOver).toBe(true)

      act(() => { container.dispatchEvent(createDragEvent('dragleave', [], { relatedTarget: document.body })) })
    }
  })

  it('tries to set cursor at drop position', async () => {
    renderImageDrop()
    const blob = new Blob(['fake'], { type: 'image/png' })
    const file = new File([blob], 'photo.png', { type: 'image/png' })

    await act(async () => { container.dispatchEvent(createDragEvent('drop', [file], { clientX: 150, clientY: 250 })) })

    expect(mockEditor._tiptapEditor.view.posAtCoords).toHaveBeenCalledWith({ left: 150, top: 250 })
    expect(mockEditor._tiptapEditor.commands.setTextSelection).toHaveBeenCalledWith(5)
  })

  it('handles multiple image files in a single drop', async () => {
    renderImageDrop()
    const file1 = new File([new Blob(['a'], { type: 'image/png' })], 'a.png', { type: 'image/png' })
    const file2 = new File([new Blob(['b'], { type: 'image/jpeg' })], 'b.jpg', { type: 'image/jpeg' })

    act(() => { container.dispatchEvent(createDragEvent('drop', [file1, file2])) })

    await waitFor(() => {
      expect(mockEditor.insertBlocks).toHaveBeenCalledTimes(2)
    })
  })
})
