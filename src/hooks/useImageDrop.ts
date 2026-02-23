import { useEffect, useState, useRef, type RefObject } from 'react'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { isTauri } from '../mock-tauri'

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function hasImageFiles(dt: DataTransfer): boolean {
  for (let i = 0; i < dt.items.length; i++) {
    if (dt.items[i].kind === 'file' && IMAGE_MIME_TYPES.includes(dt.items[i].type)) return true
  }
  return false
}

/** Upload an image file — saves to vault/attachments in Tauri, returns data URL in browser */
export async function uploadImageFile(file: File, vaultPath?: string): Promise<string> {
  if (isTauri() && vaultPath) {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    const savedPath = await invoke<string>('save_image', {
      vaultPath,
      filename: file.name,
      data: base64,
    })
    return convertFileSrc(savedPath)
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

interface UseImageDropOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
  containerRef: RefObject<HTMLDivElement | null>
  vaultPath?: string
}

export function useImageDrop({ editor, containerRef, vaultPath }: UseImageDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false)
  const vaultPathRef = useRef(vaultPath)

  useEffect(() => {
    vaultPathRef.current = vaultPath
  }, [vaultPath])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer || !hasImageFiles(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!container.contains(e.relatedTarget as Node)) {
        setIsDragOver(false)
      }
    }

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (!e.dataTransfer) return

      const files = Array.from(e.dataTransfer.files).filter(f => IMAGE_MIME_TYPES.includes(f.type))
      if (files.length === 0) return

      // Try to position cursor at the drop location
      try {
        const view = editor._tiptapEditor.view
        const dropPos = view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (dropPos) {
          editor._tiptapEditor.commands.setTextSelection(dropPos.pos)
        }
      } catch {
        // If positioning fails, we insert at the current cursor — still fine
      }

      for (const file of files) {
        try {
          const url = await uploadImageFile(file, vaultPathRef.current)
          const currentBlock = editor.getTextCursorPosition().block
          editor.insertBlocks(
            [{ type: 'image' as const, props: { url } }],
            currentBlock,
            'after',
          )
        } catch (err) {
          console.error('Failed to upload dropped image:', err)
        }
      }
    }

    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('drop', handleDrop)

    return () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('drop', handleDrop)
    }
  }, [editor, containerRef])

  return { isDragOver }
}
