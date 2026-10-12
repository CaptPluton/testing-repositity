#!/bin/bash
# Печатает в контекст сессии дату, дату последнего утреннего брифа и статус ДРР.
DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATUS="$DIR/state/status.json"
TODAY=$(date +%Y-%m-%d)
echo "OMG Marketing Department. Сегодня: $TODAY (локальное время Mac)."
if [ -f "$STATUS" ]; then
  if command -v jq >/dev/null 2>&1; then
    LAST=$(jq -r '.last_morning // "никогда"' "$STATUS")
    SPENT=$(jq -r '.spent_rub // 0' "$STATUS")
    CAP=$(jq -r '.budget_cap_rub // 30000' "$STATUS")
    D1=$(jq -r '.drr1_pct // "нет данных"' "$STATUS")
    D2=$(jq -r '.drr2_pct // "нет данных"' "$STATUS")
    echo "Последний утренний бриф: $LAST. Расход месяца: $SPENT из $CAP ₽. ДРР-1: $D1. ДРР-2: $D2."
    if [ "$LAST" != "$TODAY" ]; then
      echo "Утренний бриф за сегодня не делался: предложи Яне /morning, если она не дала другую задачу."
    fi
  else
    echo "jq не установлен: статус не прочитан (brew install jq)."
  fi
fi
if ! grep -q "ВСТАВИТЬ ПОСЛЕ /bootstrap" "$DIR/CLAUDE.md" 2>/dev/null; then :; else
  echo "Таблица показателей ещё не подключена: первым делом /bootstrap."
fi
exit 0
