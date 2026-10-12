#!/bin/bash
# Блокирует разрушительные команды и чтение файлов с доступами.
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p' | head -1)
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
fi
deny() {
  if command -v jq >/dev/null 2>&1; then
    jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  else
    echo "$1" >&2; exit 2
  fi
  exit 0
}
case "$CMD" in
  *"rm -rf /"*|*"rm -rf ~"*|*"rm -rf \$HOME"*) deny "Удаление корня или домашней папки запрещено." ;;
esac
if printf '%s' "$CMD" | grep -qiE 'доступ|парол|password|credential'; then
  deny "Файлы с доступами и паролями не читаем: правило <never> в CLAUDE.md."
fi
exit 0
