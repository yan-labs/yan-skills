合回基础分支 {base} 并推送后，执行者收尾：`git -C {repo} worktree remove {path}`，再执行 `git -C {repo} branch -D {branch}`。未合回则保留 worktree 和分支，在报告「收尾」写明释放条件。
