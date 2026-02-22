use serde::Serialize;
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    #[serde(rename = "shortHash")]
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub date: i64,
}

/// Get git log history for a specific file in the vault.
pub fn get_file_history(vault_path: &str, file_path: &str) -> Result<Vec<GitCommit>, String> {
    let vault = Path::new(vault_path);
    let file = Path::new(file_path);

    let relative = file
        .strip_prefix(vault)
        .map_err(|_| format!("File {} is not inside vault {}", file_path, vault_path))?;

    let relative_str = relative
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

    let output = Command::new("git")
        .args([
            "log",
            "--format=%H|%h|%an|%aI|%s",
            "-n",
            "20",
            "--",
            relative_str,
        ])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // No commits yet is not an error - just return empty history
        if stderr.contains("does not have any commits yet") {
            return Ok(Vec::new());
        }
        return Err(format!("git log failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let commits = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            // Format: hash|short_hash|author|date|message
            // Use splitn(5) so message (last) can contain '|'
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() != 5 {
                return None;
            }
            let date = chrono::DateTime::parse_from_rfc3339(parts[3])
                .map(|dt| dt.timestamp())
                .unwrap_or(0);

            Some(GitCommit {
                hash: parts[0].to_string(),
                short_hash: parts[1].to_string(),
                author: parts[2].to_string(),
                date,
                message: parts[4].to_string(),
            })
        })
        .collect();

    Ok(commits)
}

/// Get list of modified/added/deleted files in the vault (uncommitted changes).
pub fn get_modified_files(vault_path: &str) -> Result<Vec<ModifiedFile>, String> {
    let vault = Path::new(vault_path);

    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let files = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            if line.len() < 4 {
                return None;
            }
            let status_code = &line[..2];
            let path = line[3..].trim().to_string();

            // Only include markdown files
            if !path.ends_with(".md") {
                return None;
            }

            let status = match status_code.trim() {
                "M" | "MM" | "AM" => "modified",
                "A" => "added",
                "D" => "deleted",
                "??" => "untracked",
                "R" | "RM" => "renamed",
                _ => "modified",
            };

            let full_path = vault.join(&path).to_string_lossy().to_string();

            Some(ModifiedFile {
                path: full_path,
                relative_path: path,
                status: status.to_string(),
            })
        })
        .collect();

    Ok(files)
}

#[derive(Debug, Serialize, Clone)]
pub struct ModifiedFile {
    pub path: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    pub status: String,
}

/// Get git diff for a specific file.
pub fn get_file_diff(vault_path: &str, file_path: &str) -> Result<String, String> {
    let vault = Path::new(vault_path);
    let file = Path::new(file_path);

    let relative = file
        .strip_prefix(vault)
        .map_err(|_| format!("File {} is not inside vault {}", file_path, vault_path))?;

    let relative_str = relative
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

    // First try tracked file diff
    let output = Command::new("git")
        .args(["diff", "--", relative_str])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // If no diff (maybe staged or untracked), try diff --cached
    if stdout.is_empty() {
        let cached = Command::new("git")
            .args(["diff", "--cached", "--", relative_str])
            .current_dir(vault)
            .output()
            .map_err(|e| format!("Failed to run git diff --cached: {}", e))?;

        let cached_stdout = String::from_utf8_lossy(&cached.stdout).to_string();
        if !cached_stdout.is_empty() {
            return Ok(cached_stdout);
        }

        // Try showing untracked file as all-new
        let status = Command::new("git")
            .args(["status", "--porcelain", "--", relative_str])
            .current_dir(vault)
            .output()
            .map_err(|e| format!("Failed to run git status: {}", e))?;

        let status_out = String::from_utf8_lossy(&status.stdout);
        if status_out.starts_with("??") {
            // Untracked file: show entire content as added
            let content = std::fs::read_to_string(file)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            let lines: Vec<String> = content.lines().map(|l| format!("+{}", l)).collect();
            return Ok(format!(
                "diff --git a/{0} b/{0}\nnew file\n--- /dev/null\n+++ b/{0}\n@@ -0,0 +1,{1} @@\n{2}",
                relative_str,
                lines.len(),
                lines.join("\n")
            ));
        }
    }

    Ok(stdout)
}

/// Get git diff for a specific file at a given commit (compared to its parent).
pub fn get_file_diff_at_commit(vault_path: &str, file_path: &str, commit_hash: &str) -> Result<String, String> {
    let vault = Path::new(vault_path);
    let file = Path::new(file_path);

    let relative = file
        .strip_prefix(vault)
        .map_err(|_| format!("File {} is not inside vault {}", file_path, vault_path))?;

    let relative_str = relative
        .to_str()
        .ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

    // Show diff between commit^ and commit for this file
    let output = Command::new("git")
        .args(["diff", &format!("{}^", commit_hash), commit_hash, "--", relative_str])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    // If diff is empty, it might be the initial commit (no parent).
    // Fall back to showing the full file content as added.
    if stdout.is_empty() {
        let show = Command::new("git")
            .args(["show", &format!("{}:{}", commit_hash, relative_str)])
            .current_dir(vault)
            .output()
            .map_err(|e| format!("Failed to run git show: {}", e))?;

        if show.status.success() {
            let content = String::from_utf8_lossy(&show.stdout);
            let lines: Vec<String> = content.lines().map(|l| format!("+{}", l)).collect();
            return Ok(format!(
                "diff --git a/{0} b/{0}\nnew file\n--- /dev/null\n+++ b/{0}\n@@ -0,0 +1,{1} @@\n{2}",
                relative_str,
                lines.len(),
                lines.join("\n")
            ));
        }
    }

    Ok(stdout)
}

/// Commit all changes with a message.
pub fn git_commit(vault_path: &str, message: &str) -> Result<String, String> {
    let vault = Path::new(vault_path);

    // Stage all changes
    let add = Command::new("git")
        .args(["add", "-A"])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git add: {}", e))?;

    if !add.status.success() {
        let stderr = String::from_utf8_lossy(&add.stderr);
        return Err(format!("git add failed: {}", stderr));
    }

    // Commit
    let commit = Command::new("git")
        .args(["commit", "-m", message])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git commit: {}", e))?;

    if !commit.status.success() {
        let stderr = String::from_utf8_lossy(&commit.stderr);
        return Err(format!("git commit failed: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&commit.stdout).to_string())
}

/// Push to remote.
pub fn git_push(vault_path: &str) -> Result<String, String> {
    let vault = Path::new(vault_path);

    let output = Command::new("git")
        .args(["push"])
        .current_dir(vault)
        .output()
        .map_err(|e| format!("Failed to run git push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git push failed: {}", stderr));
    }

    // git push often writes to stderr even on success
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(format!("{}{}", stdout, stderr))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::process::Command;
    use tempfile::TempDir;

    fn setup_git_repo() -> TempDir {
        let dir = TempDir::new().unwrap();
        let path = dir.path();

        Command::new("git")
            .args(["init"])
            .current_dir(path)
            .output()
            .unwrap();

        Command::new("git")
            .args(["config", "user.email", "test@test.com"])
            .current_dir(path)
            .output()
            .unwrap();

        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(path)
            .output()
            .unwrap();

        dir
    }

    #[test]
    fn test_get_file_history_with_commits() {
        let dir = setup_git_repo();
        let vault = dir.path();
        let file = vault.join("test.md");

        fs::write(&file, "# Initial\n").unwrap();
        Command::new("git")
            .args(["add", "test.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Initial commit"])
            .current_dir(vault)
            .output()
            .unwrap();

        fs::write(&file, "# Updated\n\nNew content.").unwrap();
        Command::new("git")
            .args(["add", "test.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Update test"])
            .current_dir(vault)
            .output()
            .unwrap();

        let history = get_file_history(
            vault.to_str().unwrap(),
            file.to_str().unwrap(),
        )
        .unwrap();

        assert_eq!(history.len(), 2);
        assert_eq!(history[0].message, "Update test");
        assert_eq!(history[1].message, "Initial commit");
        assert_eq!(history[0].author, "Test User");
        assert!(!history[0].hash.is_empty());
        assert!(!history[0].short_hash.is_empty());
    }

    #[test]
    fn test_get_file_history_no_commits() {
        let dir = setup_git_repo();
        let vault = dir.path();
        let file = vault.join("new.md");
        fs::write(&file, "# New\n").unwrap();

        let history = get_file_history(
            vault.to_str().unwrap(),
            file.to_str().unwrap(),
        )
        .unwrap();

        assert!(history.is_empty());
    }

    #[test]
    fn test_get_modified_files() {
        let dir = setup_git_repo();
        let vault = dir.path();

        // Create and commit a file
        fs::write(vault.join("note.md"), "# Note\n").unwrap();
        Command::new("git")
            .args(["add", "note.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Add note"])
            .current_dir(vault)
            .output()
            .unwrap();

        // Modify it
        fs::write(vault.join("note.md"), "# Note\n\nUpdated.").unwrap();
        // Add an untracked file
        fs::write(vault.join("new.md"), "# New\n").unwrap();

        let modified = get_modified_files(vault.to_str().unwrap()).unwrap();

        assert!(modified.len() >= 2);
        let statuses: Vec<&str> = modified.iter().map(|f| f.status.as_str()).collect();
        assert!(statuses.contains(&"modified") || statuses.contains(&"untracked"));
    }

    #[test]
    fn test_get_file_diff() {
        let dir = setup_git_repo();
        let vault = dir.path();
        let file = vault.join("diff-test.md");

        fs::write(&file, "# Test\n\nOriginal content.").unwrap();
        Command::new("git")
            .args(["add", "diff-test.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Add diff-test"])
            .current_dir(vault)
            .output()
            .unwrap();

        fs::write(&file, "# Test\n\nModified content.").unwrap();

        let diff = get_file_diff(
            vault.to_str().unwrap(),
            file.to_str().unwrap(),
        )
        .unwrap();

        assert!(!diff.is_empty());
        assert!(diff.contains("-Original content."));
        assert!(diff.contains("+Modified content."));
    }

    #[test]
    fn test_get_file_diff_at_commit() {
        let dir = setup_git_repo();
        let vault = dir.path();
        let file = vault.join("diff-at-commit.md");

        fs::write(&file, "# First\n\nOriginal content.").unwrap();
        Command::new("git")
            .args(["add", "diff-at-commit.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "First commit"])
            .current_dir(vault)
            .output()
            .unwrap();

        fs::write(&file, "# First\n\nModified content.").unwrap();
        Command::new("git")
            .args(["add", "diff-at-commit.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Second commit"])
            .current_dir(vault)
            .output()
            .unwrap();

        // Get hash of second commit
        let log = Command::new("git")
            .args(["log", "--format=%H", "-1"])
            .current_dir(vault)
            .output()
            .unwrap();
        let hash = String::from_utf8_lossy(&log.stdout).trim().to_string();

        let diff = get_file_diff_at_commit(
            vault.to_str().unwrap(),
            file.to_str().unwrap(),
            &hash,
        )
        .unwrap();

        assert!(!diff.is_empty());
        assert!(diff.contains("-Original content."));
        assert!(diff.contains("+Modified content."));
    }

    #[test]
    fn test_get_file_diff_at_initial_commit() {
        let dir = setup_git_repo();
        let vault = dir.path();
        let file = vault.join("initial.md");

        fs::write(&file, "# Initial\n\nHello world.").unwrap();
        Command::new("git")
            .args(["add", "initial.md"])
            .current_dir(vault)
            .output()
            .unwrap();
        Command::new("git")
            .args(["commit", "-m", "Initial commit"])
            .current_dir(vault)
            .output()
            .unwrap();

        let log = Command::new("git")
            .args(["log", "--format=%H", "-1"])
            .current_dir(vault)
            .output()
            .unwrap();
        let hash = String::from_utf8_lossy(&log.stdout).trim().to_string();

        let diff = get_file_diff_at_commit(
            vault.to_str().unwrap(),
            file.to_str().unwrap(),
            &hash,
        )
        .unwrap();

        assert!(!diff.is_empty());
        assert!(diff.contains("+# Initial"));
        assert!(diff.contains("+Hello world."));
    }

    #[test]
    fn test_git_commit() {
        let dir = setup_git_repo();
        let vault = dir.path();

        fs::write(vault.join("commit-test.md"), "# Test\n").unwrap();

        let result = git_commit(vault.to_str().unwrap(), "Test commit");
        assert!(result.is_ok());

        // Verify the commit exists
        let log = Command::new("git")
            .args(["log", "--oneline", "-1"])
            .current_dir(vault)
            .output()
            .unwrap();
        let log_str = String::from_utf8_lossy(&log.stdout);
        assert!(log_str.contains("Test commit"));
    }
}
