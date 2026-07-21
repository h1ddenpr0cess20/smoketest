---
name: MCP Shell Coding Agent
description: Use when a shell-access MCP server (shell_mcp, docker_shell_mcp, or webshell_mcp from the h1ddenpr0cess20/mcp collection) is connected and the user wants hands-on work done through it — exploring an unfamiliar sandbox codebase, making real edits, running builds or tests, or shipping a finished result. Skip this when no such shell/MCP tools are available in the current turn.
---

You have real shell access to a remote sandbox (SSH host, VirtualBox VM, or Docker
container) through execute_command, list_directory, read_file, write_file,
upload_file, download_file, get_system_info, and fetch_file. webshell_mcp adds
web_search, news_search, and fetch_url. None of this reaches the user's actual
machine or this chat's own filesystem — it all happens inside that sandbox.

## Move like an agent with a token budget

- Batch related steps into one execute_command call with `&&` instead of one
  call per command; every call is a full round trip you're paying for.
- Read slices, not whole files: `sed -n '120,160p' file`, `rg -n -A3 pattern`,
  `grep -c "" file` for a line count. Only cat a file in full when you actually
  need every line of it.
- Investigate with git before guessing: `git log`, `git blame`, `git log -S`,
  and `git bisect` usually answer "when and why did this change" faster than
  reading code cold.
- Verify state changes by checking the result (`npm ls <pkg>`, `git diff`,
  `git status`), not by trusting a command's log output alone.
- Land in an unfamiliar sandbox by orienting first — repo root, git log,
  project manifest — rather than guessing at layout. See the cheatsheet
  resource for the exact commands.

## Know your timeout before you start something long

- shell_mcp defaults COMMAND_TIMEOUT to 30 seconds; docker_shell_mcp defaults
  to 1200 (20 minutes). A build or install that might outlast the timeout
  should run backgrounded (`nohup cmd > /tmp/log 2>&1 & echo $!`) and get
  polled afterward, not fired as one blocking call that gets cut off.

## Always hand back a real download link

- When the task produces something worth keeping, archive it before you
  finish: `zip -rq /tmp/deliverable.zip . -x '.git/*' -x 'node_modules/*'`
  (or `tar czf` if zip is missing).
- Call `fetch_file` on that archive path — it serves the file from the
  sandbox's own local HTTP file server. Use the URL the tool call actually
  returns rather than constructing one yourself; the port is configurable
  per server (shell_mcp defaults to 127.0.0.1:9611, webshell_mcp to
  127.0.0.1:9712).
- Put that URL directly in your reply as a normal link. "I made a zip" with
  no link is not a finished deliverable. If fetch_file fails, fall back to
  download_file (SFTP) and give the user the local path instead.

## How to respond

- Lead with what changed or what you found, not a transcript of every
  command you ran.
- For the full bash reference — git archaeology, search, process/network
  inspection, library lookups, packaging — consult the `shell-cheatsheet.md`
  resource.

<!-- skill:resource name="shell-cheatsheet.md" -->

# Shell MCP cheatsheet

Commands to run via execute_command inside the sandbox. All paths are
relative to wherever the shell lands you — run `pwd` first if unsure. Where a
tool might not be preinstalled (rg, jq, shellcheck), check first with
`command -v <tool>` and fall back to the plain alternative shown alongside it.

## Orient in an unfamiliar sandbox

- `pwd && whoami && uname -a`
- `git rev-parse --is-inside-work-tree 2>/dev/null && git remote -v && git log --oneline -15 && git status`
- `ls package.json pyproject.toml go.mod Cargo.toml Makefile Dockerfile requirements.txt 2>/dev/null`
- `cat package.json 2>/dev/null | head -40` — scripts, deps, entry point in one read
- `find . -maxdepth 3 -type d -not -path '*/node_modules/*' -not -path '*/.git/*' | sort`
- `env | sort` — see what's already configured before assuming it isn't

## Git: read history like a detective

- `git log --oneline --graph --decorate -20` — shape of recent history at a glance
- `git log -p -L 10,40:file` — history of one line range, not the whole file's log
- `git log -S'needle' --oneline` — pickaxe: commits that added or removed an exact string (fastest way to answer "when did this appear")
- `git log -G'regex' --oneline` — same idea, matched against the diff by regex instead of an exact string
- `git log --follow -p -- file` — full history of a file across renames
- `git blame -L 10,40 file` — who/when touched specific lines
- `git show <sha> -- path` — one file at one commit, not a full checkout
- `git diff` / `git diff --staged` — unstaged vs staged changes
- `git diff branchA..branchB -- path` — compare across branches, scoped to a path
- `git diff --stat` — which files changed and by how much, no content
- `git shortlog -sn` — contributors ranked by commit count
- `git log --since="2 weeks ago" --author="name" --oneline` — scoped history
- `git bisect start && git bisect bad && git bisect good <sha>` — binary-search for the commit that introduced a bug; `git bisect run <test-cmd>` automates the whole search
- `git stash` / `git stash pop` — shelve in-progress work before switching context without losing it
- `git switch -c branch` / `git checkout -b branch` — start isolated work
- `git reflog` — recover a commit or branch that looks lost; almost nothing is truly gone
- `git grep -n "pattern"` — search only tracked files, honors .gitignore automatically — cleaner and faster than plain grep -r
- `git ls-files` — tracked files only, build output and node_modules excluded for free
- `git cherry-pick <sha>` — apply one specific commit elsewhere
- `git log --all --oneline -- path` — a file's history across every branch, not just the current one

## Search fast instead of reading everything

- `command -v rg >/dev/null && rg -n "pattern" --hidden -g '!.git' || grep -rn "pattern" --exclude-dir=.git .`
- `rg -l "pattern"` — just the file list, no content, when that's all you need
- `rg --files -g '*.py'` — list files matching a glob without opening any
- `rg -n -A3 -B3 "pattern"` — a few lines of context instead of the whole match location
- `sed -n '120,160p' file` — read a line range instead of the whole file

## See the shape of a codebase

- `du -sh */ 2>/dev/null | sort -h` — biggest directories first
- `find . -iname '*test*' -not -path '*/node_modules/*'` — locate the test suite
- `wc -l $(find . -name '*.py') | tail -1` — total line count for one language
- `find . -type f -newer .git/HEAD -not -path '*/.git/*'` — files touched since the last commit

## Inspect processes, ports, and system state

- `ps aux --sort=-%mem | head -15` — biggest processes by memory
- `command -v ss >/dev/null && ss -tlnp || netstat -tlnp` — what's listening on which port
- `lsof -i :3000` — what's bound to a specific port before you try to use it
- `kill <pid>` / `kill -9 <pid>` — stop a stuck process; try the plain signal before -9
- `df -h` / `du -sh /path` — disk space, whole-disk then targeted
- `free -h` — memory headroom before starting something heavy
- `which <cmd>` / `command -v <cmd>` — confirm a tool exists before scripting around it

## Look up library/package details without a browser

- Node: `npm view <pkg>` · `npm view <pkg> versions --json` · `npm view <pkg> dependencies` · `cat node_modules/<pkg>/package.json`
- Python: `pip show <pkg>` · `pip index versions <pkg>` · `python3 -c "import <pkg>; print(<pkg>.__version__, <pkg>.__file__)"`
- Go: `go doc <pkg>` · `go list -m -versions <pkg>`
- Rust: `cargo metadata --format-version1 | python3 -m json.tool`, or read `Cargo.lock` directly
- Any registry, no local tooling needed: `curl -s https://registry.npmjs.org/<pkg>/latest | python3 -m json.tool`, or `curl -s https://pypi.org/pypi/<pkg>/json | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['info']['version'], d['info']['summary'])"`
- `<tool> --help` / `man <tool>` before guessing at flags
- On webshell_mcp: call `web_search` or `fetch_url` directly for docs pages, changelogs, or GitHub issues instead of a registry API round trip

## Process JSON, logs, and tabular output

- `command -v jq >/dev/null && cat file.json | jq '.key'` — pull one field instead of dumping the whole payload; falls back to `python3 -m json.tool` if jq is missing
- `curl -s URL | jq -r '.[].name'` — combine a fetch with extraction in one call
- `sort | uniq -c | sort -rn` — frequency count, e.g. `grep ERROR app.log | sort | uniq -c | sort -rn | head` for the most common error
- `awk '{print $1}'` / `cut -d',' -f2` — pull one column out of structured text
- `column -t` — align whitespace-separated output into readable columns
- `tail -f log & sleep 5; kill %1` — sample a live log briefly instead of tailing forever

## Probe the network and APIs

- `curl -sS -i URL` — headers and body together, one call
- `curl -sS -o /dev/null -w '%{http_code}\n' URL` — just the status code, to confirm something is up
- `curl -sS -X POST -H 'Content-Type: application/json' -d '{"key":"value"}' URL` — quick API probe
- `nc -zv host port` — is anything even listening, before debugging further up the stack
- `getent hosts <hostname>` / `dig <hostname> +short` — DNS resolution check

## Quick language-specific sanity checks

- Python: `python3 -m py_compile file.py` — syntax check without running it; `python3 -m venv .venv && source .venv/bin/activate` for an isolated env
- Node: `node --check file.js` — syntax check without running; `npx tsc --noEmit` for a fast typecheck; `npm ls --depth=0` for top-level deps only
- Shell: `bash -n script.sh` — syntax check; `command -v shellcheck >/dev/null && shellcheck script.sh` if available
- Any: run one test at a time while iterating (`pytest path::test_name -x`, `npx vitest run path/to/file.test.ts`, `go test ./pkg/ -run TestName`) instead of the full suite, then run the full suite once at the end

## Edit without burning the whole file through the wire

- `sed -i 's/old/new/g' file` for simple substitutions, then `git diff` to confirm
- A short `python3 -c "..."` one-liner for anything sed can't express cleanly
- write_file/read_file tools for a full rewrite; sed/python for a small patch
- `chmod +x script.sh` after writing anything meant to run directly

## Long-running commands

- Check the cost first: `time <cmd>`
- Background anything that might outlast the timeout: `nohup cmd > /tmp/log 2>&1 & echo $!`, then `tail -n 40 /tmp/log` or `ps -p <pid>` to poll it

## Package and serve the result

- `zip -rq /tmp/deliverable.zip . -x '.git/*' -x 'node_modules/*' -x '__pycache__/*'`
- `tar czf /tmp/deliverable.tar.gz --exclude=.git --exclude=node_modules .` if zip isn't installed
- `unzip -l /tmp/deliverable.zip | tail -5`, or `tar tzf /tmp/deliverable.tar.gz | wc -l`, to confirm it's non-empty before calling fetch_file
- Then call `fetch_file` on the archive path and hand the returned URL straight to the user

<!-- /skill:resource -->
