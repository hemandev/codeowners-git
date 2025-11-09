---
"codeowners-git": minor
---

Add `extract` command to copy file changes from source branches/commits

New `extract` command allows you to:
- Extract changed files from any branch or commit to your working directory (unstaged)
- Filter extracted files by codeowner using micromatch patterns (`@team-*`)
- Automatically detect merge-base or compare against main branch
- Review and modify extracted files before committing

Common workflow:
```bash
# Extract files from another branch
cg extract -s feature/other-team -o "@my-team"

# Then use branch command to commit
cg branch -o @my-team -b my-branch -m "Extracted changes" -p --pr
```

This is useful for cherry-picking changes from colleague's branches or copying work between feature branches.
