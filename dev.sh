#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="glv-dev"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists — attaching."
  tmux attach-session -t "$SESSION"
  exit 0
fi

# Single window, top pane = backend
tmux new-session -d -s "$SESSION" -n dev \
  "cd '$REPO_ROOT/backend' && npm install && npx playwright install chrome && npm run dev; read"

# Bottom pane = dashboard (horizontal split)
tmux split-window -t "$SESSION:dev" -v \
  "cd '$REPO_ROOT/dashboard' && { [ -d node_modules ] || npm install; } && npm run dev; read"

# New window to wait for the server then open the browser
tmux new-window -t "$SESSION" -n browser "
  echo 'Waiting for dashboard on http://localhost:5173...'
  until curl -sf http://localhost:5173 >/dev/null 2>&1; do sleep 1; done
  open http://localhost:5173
  echo 'Browser launched. Press Ctrl-C or close tmux to stop.'
  read
"

tmux select-window -t "$SESSION:dev"
tmux attach-session -t "$SESSION"
