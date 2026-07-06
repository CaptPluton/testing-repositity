#!/usr/bin/env python3
"""Генератор отчёта по рассылке для Obgolts Media Group.

Читает sales-agent/state/leads.json, activity-log.json и weekly.json,
собирает Excel-книгу из трёх листов:
  1. «Журнал рассылки» — все письма и контакты, по строке на лида
  2. «Воронка и ответы» — сводка и разрез по нишам (живые формулы)
  3. «Динамика по неделям» — метрики по неделям + выводы по стратегии

Файл сохраняется в sales-agent/report/report.xlsx. При загрузке на
Google Диск конвертируется в Google Таблицу с теми же тремя листами,
формулы продолжают работать. Источник данных — leads.json: таблицу не
нужно править руками, агент перегенерирует её при каждом обновлении.
"""

import json
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state"
OUT = Path(__file__).resolve().parent / "report.xlsx"

STATUS_RU = {
    "backlog": "Резерв",
    "drafted": "Подготовлено",
    "sent": "Отправлено",
    "replied": "Ответил",
    "negotiating": "Переговоры",
    "call_scheduled": "Созвон назначен",
    "client": "Стал клиентом",
    "escalated": "Эскалация (Яна)",
    "not_interested": "Отказ",
    "unsubscribed": "Отписался",
}
NICHE_RU = {"beauty": "Бьюти", "education": "Обучение", "medicine": "Медицина"}

# статусы, означающие «письмо реально отправлено»
SENT_SET = ["Отправлено", "Ответил", "Переговоры", "Созвон назначен",
            "Стал клиентом", "Эскалация (Яна)", "Отказ", "Отписался"]
REPLIED_SET = ["Ответил", "Переговоры", "Созвон назначен", "Стал клиентом",
               "Эскалация (Яна)", "Отказ", "Отписался"]
POSITIVE_SET = ["Переговоры", "Созвон назначен", "Стал клиентом"]
CALL_SET = ["Созвон назначен", "Стал клиентом"]

HDR_FILL = PatternFill("solid", fgColor="134E4A")
HDR_FONT = Font(bold=True, color="FFFFFF")
SUB_FILL = PatternFill("solid", fgColor="E0F2F1")
SUB_FONT = Font(bold=True)


def parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date() if s else None


def style_header(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = Alignment(vertical="center", wrap_text=True)


def countif_sum(rng, values):
    return "=" + "+".join(f'COUNTIF({rng},"{v}")' for v in values)


def countifs_niche_sum(niche, values):
    return "=" + "+".join(
        f"COUNTIFS('Журнал рассылки'!$D:$D,\"{niche}\",'Журнал рассылки'!$J:$J,\"{v}\")"
        for v in values
    )


def main():
    leads = json.load(open(STATE / "leads.json"))["leads"]
    weekly_path = STATE / "weekly.json"
    weekly = json.load(open(weekly_path)) if weekly_path.exists() else {}

    wb = Workbook()

    # ---------- Лист 1. Журнал рассылки ----------
    ws = wb.active
    ws.title = "Журнал рассылки"
    headers = ["№", "Дата письма", "Компания", "Ниша", "Город", "Контакт", "Email",
               "Сайт", "Тема письма", "Статус", "Дата ответа", "Фоллоу-апы",
               "Дата созвона", "Заметки"]
    ws.append(headers)
    style_header(ws, 1, len(headers))
    ws.freeze_panes = "A2"

    for i, lead in enumerate(leads, 1):
        ws.append([
            i,
            parse_date(lead.get("created_at")),
            lead.get("company"),
            NICHE_RU.get(lead.get("niche"), lead.get("niche") or ""),
            lead.get("city"),
            lead.get("contact_name") or "—",
            lead.get("email"),
            lead.get("website"),
            lead.get("subject") or "—",
            STATUS_RU.get(lead.get("status"), lead.get("status")),
            parse_date(lead.get("replied_at")),
            lead.get("followups_sent", 0),
            parse_date(lead.get("call_at")),
            lead.get("notes", ""),
        ])
    for col, width in zip("ABCDEFGHIJKLMN",
                          [4, 12, 34, 11, 22, 24, 26, 28, 38, 16, 12, 10, 12, 60]):
        ws.column_dimensions[col].width = width
    for r in range(2, ws.max_row + 1):
        ws.cell(row=r, column=2).number_format = "DD.MM.YYYY"
        ws.cell(row=r, column=11).number_format = "DD.MM.YYYY"
        ws.cell(row=r, column=13).number_format = "DD.MM.YYYY"

    # ---------- Лист 2. Воронка и ответы ----------
    ws2 = wb.create_sheet("Воронка и ответы")
    ws2.column_dimensions["A"].width = 38
    for c in "BCDEFG":
        ws2.column_dimensions[c].width = 15

    ws2["A1"] = "Воронка холодной рассылки — сводка"
    ws2["A1"].font = Font(bold=True, size=13)
    J = "'Журнал рассылки'!$J:$J"
    rows = [
        ("Подготовлено (ждут отправки)", f'=COUNTIF({J},"Подготовлено")', None),
        ("В резерве", f'=COUNTIF({J},"Резерв")', None),
        ("Отправлено", countif_sum(J, SENT_SET), None),
        ("Получено ответов", countif_sum(J, REPLIED_SET), None),
        ("Reply rate (доля ответов)", "=IFERROR(B6/B5,0)", "0.0%"),
        ("Позитивные ответы (интерес)", countif_sum(J, POSITIVE_SET), None),
        ("Созвонов назначено", countif_sum(J, CALL_SET), None),
        ("Конверсия отправлено → созвон", "=IFERROR(B9/B5,0)", "0.0%"),
        ("Отказов", f'=COUNTIF({J},"Отказ")', None),
        ("Отписалось", f'=COUNTIF({J},"Отписался")', None),
        ("Эскалаций (нужна Яна)", f'=COUNTIF({J},"Эскалация (Яна)")', None),
    ]
    r = 3
    for name, formula, fmt in rows:
        ws2.cell(row=r, column=1, value=name)
        cell = ws2.cell(row=r, column=2, value=formula)
        if fmt:
            cell.number_format = fmt
        r += 1

    r += 1
    ws2.cell(row=r, column=1, value="Разрез по нишам").font = Font(bold=True, size=13)
    r += 1
    niche_hdr = ["Ниша", "Отправлено", "Ответов", "Reply rate", "Позитив", "Созвонов", "Конверсия"]
    for c, h in enumerate(niche_hdr, 1):
        ws2.cell(row=r, column=c, value=h)
    style_header(ws2, r, len(niche_hdr))
    for niche in ["Бьюти", "Обучение", "Медицина"]:
        r += 1
        ws2.cell(row=r, column=1, value=niche)
        ws2.cell(row=r, column=2, value=countifs_niche_sum(niche, SENT_SET))
        ws2.cell(row=r, column=3, value=countifs_niche_sum(niche, REPLIED_SET))
        ws2.cell(row=r, column=4, value=f"=IFERROR(C{r}/B{r},0)").number_format = "0.0%"
        ws2.cell(row=r, column=5, value=countifs_niche_sum(niche, POSITIVE_SET))
        ws2.cell(row=r, column=6, value=countifs_niche_sum(niche, CALL_SET))
        ws2.cell(row=r, column=7, value=f"=IFERROR(F{r}/B{r},0)").number_format = "0.0%"

    r += 3
    ws2.cell(row=r, column=1, value="Ориентиры для оценки (холодная B2B-рассылка)").font = SUB_FONT
    tips = [
        "Reply rate 3–7% — норма, 10%+ — отлично, ниже 2% после 50 писем — менять тему и первый абзац.",
        "Ответы есть, а созвонов нет — проблема в CTA или оффере, а не в базе.",
        "Отписок больше 10% — пересмотреть нишу или качество базы.",
        "Конверсия в созвон 1–3% от отправленных — рабочий уровень для старта.",
        "Выводы по неделям и решения по стратегии — на листе «Динамика по неделям».",
    ]
    for tip in tips:
        r += 1
        ws2.cell(row=r, column=1, value="• " + tip)

    # ---------- Лист 3. Динамика по неделям ----------
    ws3 = wb.create_sheet("Динамика по неделям")
    hdr3 = ["Неделя с", "по", "Отправлено", "Ответов", "Reply rate",
            "Позитивных", "Созвонов", "Конверсия в созвон", "Выводы и решения по стратегии"]
    ws3.append(hdr3)
    style_header(ws3, 1, len(hdr3))
    ws3.freeze_panes = "A2"
    for col, width in zip("ABCDEFGHI", [11, 11, 12, 10, 11, 12, 10, 16, 80]):
        ws3.column_dimensions[col].width = width

    B = "'Журнал рассылки'!$B:$B"
    K = "'Журнал рассылки'!$K:$K"
    M = "'Журнал рассылки'!$M:$M"
    first_monday = date(2026, 7, 6)
    for w in range(16):
        r = w + 2
        start = first_monday + timedelta(weeks=w)
        end = start + timedelta(days=6)
        ws3.cell(row=r, column=1, value=start).number_format = "DD.MM.YYYY"
        ws3.cell(row=r, column=2, value=end).number_format = "DD.MM.YYYY"
        sent_parts = "+".join(
            f'COUNTIFS({B},">="&$A{r},{B},"<="&$B{r},{J},"{v}")' for v in SENT_SET
        )
        ws3.cell(row=r, column=3, value=f"={sent_parts}")
        ws3.cell(row=r, column=4, value=f'=COUNTIFS({K},">="&$A{r},{K},"<="&$B{r})')
        ws3.cell(row=r, column=5, value=f"=IFERROR(D{r}/C{r},\"\")").number_format = "0.0%"
        pos_parts = "+".join(
            f'COUNTIFS({K},">="&$A{r},{K},"<="&$B{r},{J},"{v}")' for v in POSITIVE_SET
        )
        ws3.cell(row=r, column=6, value=f"={pos_parts}")
        ws3.cell(row=r, column=7, value=f'=COUNTIFS({M},">="&$A{r},{M},"<="&$B{r})')
        ws3.cell(row=r, column=8, value=f"=IFERROR(G{r}/C{r},\"\")").number_format = "0.0%"
        note = weekly.get(start.isoformat(), {}).get("conclusions", "")
        ws3.cell(row=r, column=9, value=note).alignment = Alignment(wrap_text=True)

    wb.save(OUT)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    main()
