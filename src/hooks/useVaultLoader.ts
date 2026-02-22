import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { VaultEntry, GitCommit, ModifiedFile } from '../types'

export function useVaultLoader(vaultPath: string) {
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [allContent, setAllContent] = useState<Record<string, string>>({})
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([])

  useEffect(() => {
    setEntries([])
    setAllContent({})
    setModifiedFiles([])

    const loadVault = async () => {
      try {
        let result: VaultEntry[]
        if (isTauri()) {
          result = await invoke<VaultEntry[]>('list_vault', { path: vaultPath })
        } else {
          console.info('[mock] Using mock Tauri data for browser testing')
          result = await mockInvoke<VaultEntry[]>('list_vault', { path: vaultPath })
        }
        console.log(`Vault scan complete: ${result.length} entries found`)
        setEntries(result)

        let content: Record<string, string>
        if (isTauri()) {
          content = {}
        } else {
          content = await mockInvoke<Record<string, string>>('get_all_content', { path: vaultPath })
        }
        setAllContent(content)
      } catch (err) {
        console.warn('Vault scan failed:', err)
      }
    }
    loadVault()
  }, [vaultPath])

  const loadModifiedFiles = useCallback(async () => {
    try {
      let files: ModifiedFile[]
      if (isTauri()) {
        files = await invoke<ModifiedFile[]>('get_modified_files', { vaultPath })
      } else {
        files = await mockInvoke<ModifiedFile[]>('get_modified_files', {})
      }
      setModifiedFiles(files)
    } catch (err) {
      console.warn('Failed to load modified files:', err)
      setModifiedFiles([])
    }
  }, [vaultPath])

  useEffect(() => {
    loadModifiedFiles()
  }, [loadModifiedFiles])

  const addEntry = useCallback((entry: VaultEntry, content: string) => {
    setEntries((prev) => [entry, ...prev])
    setAllContent((prev) => ({ ...prev, [entry.path]: content }))
  }, [])

  const updateContent = useCallback((path: string, content: string) => {
    setAllContent((prev) => ({ ...prev, [path]: content }))
  }, [])

  const updateEntry = useCallback((path: string, patch: Partial<VaultEntry>) => {
    setEntries((prev) => prev.map((e) => e.path === path ? { ...e, ...patch } : e))
  }, [])

  const loadGitHistory = useCallback(async (path: string): Promise<GitCommit[]> => {
    try {
      if (isTauri()) {
        return await invoke<GitCommit[]>('get_file_history', { vaultPath, path })
      } else {
        return await mockInvoke<GitCommit[]>('get_file_history', { path })
      }
    } catch (err) {
      console.warn('Failed to load git history:', err)
      return []
    }
  }, [vaultPath])

  const loadDiffAtCommit = useCallback(async (path: string, commitHash: string): Promise<string> => {
    if (isTauri()) {
      return invoke<string>('get_file_diff_at_commit', { vaultPath, path, commitHash })
    } else {
      return mockInvoke<string>('get_file_diff_at_commit', { path, commitHash })
    }
  }, [vaultPath])

  const loadDiff = useCallback(async (path: string): Promise<string> => {
    if (isTauri()) {
      return invoke<string>('get_file_diff', { vaultPath, path })
    } else {
      return mockInvoke<string>('get_file_diff', { path })
    }
  }, [vaultPath])

  const isFileModified = useCallback((path: string): boolean => {
    return modifiedFiles.some((f) => f.path === path)
  }, [modifiedFiles])

  const commitAndPush = useCallback(async (message: string): Promise<string> => {
    if (isTauri()) {
      await invoke<string>('git_commit', { vaultPath, message })
      try {
        await invoke<string>('git_push', { vaultPath })
        return 'Committed and pushed'
      } catch {
        return 'Committed (push failed)'
      }
    } else {
      await mockInvoke<string>('git_commit', { message })
      await mockInvoke<string>('git_push', {})
      return 'Committed and pushed'
    }
  }, [vaultPath])

  return {
    entries,
    allContent,
    modifiedFiles,
    addEntry,
    updateEntry,
    updateContent,
    loadModifiedFiles,
    loadGitHistory,
    loadDiff,
    loadDiffAtCommit,
    isFileModified,
    commitAndPush,
  }
}
