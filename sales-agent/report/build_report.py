#!/usr/bin/env python3
"""Генератор отчёта по рассылке OMG (v2).

Из sales-agent/state/{leads,weekly}.json собирает:
  1. «Журнал рассылки»   — строка на лида, все контакты и статусы
  2. «Воронка и ответы»  — сводка + разрезы (ниши, варианты A/B, тип ящика)
  3. «Когорты по неделям»— строка = неделя ОТПРАВКИ; ответы за 3/7/14 дней
  4. «Оперативная активность» — недели по календарю: подготовлено/отправлено/ответы/созвоны
  5. «Эксперименты и решения» — из weekly.json

Правила метрик: все rate — от подтверждённо отправленных (sent_at есть);
bounced исключается из знаменателя reply rate. Открытия не трекаются.

Запуск:  python3 build_report.py           → report.xlsx
         python3 build_report.py --json    → метрики недельных когорт в stdout (для weekly-review)

Битые даты не валят сборку: значение попадает в лист «Журнал» пустым,
а предупреждение — в stderr и в results["warnings"] (--json).
"""

import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state"
OUT = Path(__file__).resolve().parent / "report.xlsx"

STATUS_RU = {
    "backlog": "Резерв", "drafted": "Подготовлено", "sent": "Отправлено",
    "bounced": "Bounce", "replied": "Ответил", "negotiating": "Переговоры",
    "call_scheduled": "Созвон назначен", "call_done": "Созвон состоялся",
    "client": "Стал клиентом", "lost": "Проигран", "escalated": "Эскалация (Яна)",
    "no_response": "Без ответа", "not_interested": "Отказ", "unsubscribed": "Отписался",
}
NICHE_RU = {"beauty": "Бьюти", "education": "Обучение", "medicine": "Медицина"}
REPLIED_STATUSES = {"replied", "negotiating", "call_scheduled", "call_done",
                    "client", "lost", "escalated", "not_interested", "unsubscribed"}
# lost намеренно не входит: проигрыш возможен и без созвона (на этапе переписки);
# созвон считается по статусам ниже или по фактической дате call_at
CALL_STATUSES = {"call_scheduled", "call_done", "client"}
POSITIVE_STATUSES = {"negotiating", "call_scheduled", "call_done", "client"}

warnings = []


def parse_date(value, field, lead_id):
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        warnings.append(f"{lead_id}: битая дата в {field}: {value!r}")
        return None


def monday(d):
    return d - timedelta(days=d.weekday())


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def load():
    try:
        leads = json.load(open(STATE / "leads.json"))["leads"]
    except (json.JSONDecodeError, KeyError) as e:
        sys.exit(f"leads.json не читается: {e} — почини файл перед сборкой отчёта")
    weekly_path = STATE / "weekly.json"
    weekly = {}
    if weekly_path.exists():
        try:
            weekly = json.load(open(weekly_path))
        except json.JSONDecodeError as e:
            warnings.append(f"weekly.json не читается ({e}) — лист экспериментов будет пуст")
    return leads, weekly


def enrich(leads):
    today = date.today()
    rows = []
    for l in leads:
        lid = l.get("id", "?")
        sent = parse_date(l.get("sent_at"), "sent_at", lid)
        replied = parse_date(l.get("replied_at"), "replied_at", lid)
        call = parse_date((l.get("call_at") or "")[:10], "call_at", lid)
        lag = (replied - sent).days if sent and replied else None
        rows.append({
            "lead": l, "sent": sent, "replied": replied, "call": call,
            "created": parse_date(l.get("created_at"), "created_at", lid),
            "reply_lag": lag,
            "is_sent": sent is not None,
            "is_bounced": l.get("status") == "bounced",
            "is_replied": l.get("status") in REPLIED_STATUSES or replied is not None,
            "is_call": l.get("status") in CALL_STATUSES or call is not None,
            "is_positive": l.get("status") in POSITIVE_STATUSES,
            "stale_drafted": l.get("status") == "drafted" and (l.get("created_at") and (today - parse_date(l["created_at"], "created_at", lid)).days > 2),
        })
    return rows


def cohort_metrics(rows):
    """Недельные когорты по дате ОТПРАВКИ + разрезы."""
    cohorts = defaultdict(lambda: {"sent": 0, "bounced": 0, "r3": 0, "r7": 0, "r14": 0,
                                   "replies": 0, "calls": 0,
                                   "niche": defaultdict(lambda: defaultdict(int)),
                                   "variant": defaultdict(lambda: defaultdict(int)),
                                   "email_type": defaultdict(lambda: defaultdict(int))})
    today = date.today()
    for r in rows:
        if not r["is_sent"]:
            continue
        wk = monday(r["sent"]).isoformat()
        c = cohorts[wk]
        c["sent"] += 1
        for cut, agg in (("niche", NICHE_RU.get(r["lead"].get("niche"), "—")),
                         ("variant", r["lead"].get("variant") or "—"),
                         ("email_type", r["lead"].get("email_type") or "—")):
            c[cut][agg]["sent"] += 1
        if r["is_bounced"]:
            c["bounced"] += 1
            c["niche"][NICHE_RU.get(r["lead"].get("niche"), "—")]["bounced"] += 1
            continue
        if r["is_replied"]:
            c["replies"] += 1
            for cut, agg in (("niche", NICHE_RU.get(r["lead"].get("niche"), "—")),
                             ("variant", r["lead"].get("variant") or "—"),
                             ("email_type", r["lead"].get("email_type") or "—")):
                c[cut][agg]["replies"] += 1
            if r["reply_lag"] is not None:
                for cut_days, key in ((3, "r3"), (7, "r7"), (14, "r14")):
                    if r["reply_lag"] <= cut_days:
                        c[key] += 1
        if r["is_call"]:
            c["calls"] += 1
            c["niche"][NICHE_RU.get(r["lead"].get("niche"), "—")]["calls"] += 1
    out = {}
    for wk, c in sorted(cohorts.items()):
        denom = c["sent"] - c["bounced"]
        mature = (today - date.fromisoformat(wk)).days >= 14 + 6  # неделя закончилась и прошло 14 дней
        lo, hi = wilson(c["replies"], denom) if denom else (0, 0)
        out[wk] = {
            "sent": c["sent"], "bounced": c["bounced"], "delivered": denom,
            "replies_3d": c["r3"], "replies_7d": c["r7"], "replies_14d": c["r14"],
            "replies_total": c["replies"], "calls": c["calls"],
            "reply_rate": round(c["replies"] / denom, 4) if denom else None,
            "reply_rate_wilson_95": [round(lo, 4), round(hi, 4)],
            "call_rate": round(c["calls"] / denom, 4) if denom else None,
            "mature": mature,
            "by_niche": {k: dict(v) for k, v in c["niche"].items()},
            "by_variant": {k: dict(v) for k, v in c["variant"].items()},
            "by_email_type": {k: dict(v) for k, v in c["email_type"].items()},
        }
    return out


def json_mode(rows, weekly):
    cohorts = cohort_metrics(rows)
    payload = {
        "generated_note": "все rate — от доставленных (sent - bounced); mature=false → когорта не дозрела, решения не принимать",
        "cohorts_by_send_week": cohorts,
        "totals": {
            "leads": len(rows),
            "drafted_unconfirmed": sum(1 for r in rows if r["lead"].get("status") == "drafted"),
            "stale_drafted_over_2d": sum(1 for r in rows if r["stale_drafted"]),
            "sent_confirmed": sum(1 for r in rows if r["is_sent"]),
            "bounced": sum(1 for r in rows if r["is_bounced"]),
            "replies": sum(1 for r in rows if r["is_sent"] and r["is_replied"] and not r["is_bounced"]),
            "calls": sum(1 for r in rows if r["is_call"]),
            "clients": sum(1 for r in rows if r["lead"].get("status") == "client"),
        },
        "experiments": [e for wk in sorted(weekly) if isinstance(weekly.get(wk), dict)
                        for e in weekly[wk].get("experiments", [])],
        "warnings": warnings,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=1))


def xlsx_mode(rows, weekly):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    HDR_FILL = PatternFill("solid", fgColor="134E4A")
    HDR_FONT = Font(bold=True, color="FFFFFF")

    def style_header(ws, row, ncols):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=row, column=c)
            cell.fill = HDR_FILL
            cell.font = HDR_FONT
            cell.alignment = Alignment(vertical="center", wrap_text=True)

    wb = Workbook()

    # ---- 1. Журнал рассылки ----
    ws = wb.active
    ws.title = "Журнал рассылки"
    headers = ["№", "Дата подготовки", "Дата отправки", "Компания", "Ниша", "Город", "Контакт",
               "Email", "Тип ящика", "Сайт", "Тема", "Вариант", "Статус", "Дата ответа",
               "Лаг ответа, дн", "Фоллоу-апы", "Дата созвона", "Исход созвона", "Заметки"]
    ws.append(headers)
    style_header(ws, 1, len(headers))
    ws.freeze_panes = "A2"
    for i, r in enumerate(rows, 1):
        l = r["lead"]
        ws.append([
            i, r["created"], r["sent"], l.get("company"), NICHE_RU.get(l.get("niche"), l.get("niche")),
            l.get("city"), l.get("contact_name") or "—", l.get("email"),
            l.get("email_type"), l.get("website"), l.get("subject") or "—",
            l.get("variant") or "—", STATUS_RU.get(l.get("status"), l.get("status")),
            r["replied"], r["reply_lag"], l.get("followups_sent", 0), r["call"],
            l.get("call_outcome") or "", l.get("notes", ""),
        ])
    widths = [4, 12, 12, 32, 10, 18, 22, 26, 10, 26, 34, 8, 16, 12, 8, 8, 12, 10, 55]
    for idx, w in enumerate(widths, 1):
        ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = w
    for rr in range(2, ws.max_row + 1):
        for col in (2, 3, 14, 17):
            ws.cell(row=rr, column=col).number_format = "DD.MM.YYYY"

    # ---- 2. Воронка и ответы ----
    ws2 = wb.create_sheet("Воронка и ответы")
    ws2.column_dimensions["A"].width = 40
    for c in "BCDEFGH":
        ws2.column_dimensions[c].width = 13
    sent_rows = [r for r in rows if r["is_sent"]]
    delivered = [r for r in sent_rows if not r["is_bounced"]]
    replies = [r for r in delivered if r["is_replied"]]
    calls = [r for r in rows if r["is_call"]]
    data = [
        ("Лидов в базе", len(rows)),
        ("Подготовлено, отправка не подтверждена", sum(1 for r in rows if r["lead"].get("status") == "drafted")),
        ("— из них висят > 2 дней (алерт!)", sum(1 for r in rows if r["stale_drafted"])),
        ("Отправлено (подтверждено)", len(sent_rows)),
        ("Bounce (не доставлено)", len(sent_rows) - len(delivered)),
        ("Доставлено", len(delivered)),
        ("Ответов", len(replies)),
        ("Reply rate (от доставленных)", (len(replies) / len(delivered)) if delivered else None),
        ("Позитивных (переговоры+)", sum(1 for r in delivered if r["is_positive"])),
        ("Созвонов", len(calls)),
        ("Конверсия доставлено → созвон", (len(calls) / len(delivered)) if delivered else None),
        ("Клиентов", sum(1 for r in rows if r["lead"].get("status") == "client")),
        ("Отказов / отписок", sum(1 for r in rows if r["lead"].get("status") in ("not_interested", "unsubscribed"))),
        ("Эскалаций открыто", sum(1 for r in rows if r["lead"].get("status") == "escalated")),
    ]
    ws2["A1"] = "Воронка (все время)"
    ws2["A1"].font = Font(bold=True, size=13)
    rr = 3
    for name, val in data:
        ws2.cell(row=rr, column=1, value=name)
        cell = ws2.cell(row=rr, column=2, value=val)
        if isinstance(val, float):
            cell.number_format = "0.0%"
        rr += 1

    def cut_block(title, keyfn):
        nonlocal rr
        rr += 2
        ws2.cell(row=rr, column=1, value=title).font = Font(bold=True, size=13)
        rr += 1
        hdr = ["Сегмент", "Отправлено", "Bounce", "Ответов", "Reply rate", "Созвонов", "Конверсия"]
        for c, h in enumerate(hdr, 1):
            ws2.cell(row=rr, column=c, value=h)
        style_header(ws2, rr, len(hdr))
        groups = defaultdict(list)
        for r in sent_rows:
            groups[keyfn(r["lead"]) or "—"].append(r)
        for seg in sorted(groups):
            rr += 1
            g = groups[seg]
            dlv = [r for r in g if not r["is_bounced"]]
            rep = [r for r in dlv if r["is_replied"]]
            cl = [r for r in dlv if r["is_call"]]
            ws2.cell(row=rr, column=1, value=seg)
            ws2.cell(row=rr, column=2, value=len(g))
            ws2.cell(row=rr, column=3, value=len(g) - len(dlv))
            ws2.cell(row=rr, column=4, value=len(rep))
            ws2.cell(row=rr, column=5, value=(len(rep) / len(dlv)) if dlv else None).number_format = "0.0%"
            ws2.cell(row=rr, column=6, value=len(cl))
            ws2.cell(row=rr, column=7, value=(len(cl) / len(dlv)) if dlv else None).number_format = "0.0%"

    cut_block("По нишам", lambda l: NICHE_RU.get(l.get("niche")))
    cut_block("По вариантам письма (A/B)", lambda l: l.get("variant"))
    cut_block("По типу ящика", lambda l: l.get("email_type"))
    cut_block("По наличию имени ЛПР", lambda l: "имя известно" if l.get("has_contact_name") else "без имени")
    rr += 2
    ws2.cell(row=rr, column=1, value="Ориентиры (источник — playbook.md, «Ориентиры метрик» и «Ворота выборки»): reply rate 3–7% норма, "
             "<2% при ≥50 доставленных — тревога; bounce >5% — тревога; тема/абзац — только по A/B ≥40 отправок на вариант; "
             "отказ от ниши — 0 ответов на 60 отправках или (bounce+отписки) >15%; пересмотр базы — отписки+жалобы ≥8. "
             "Решения — только по дозревшим когортам ≥14 дней (лист 3) и через подтверждение Яны.").alignment = Alignment(wrap_text=True)

    # ---- 3. Когорты по неделям отправки ----
    ws3 = wb.create_sheet("Когорты по неделям")
    hdr3 = ["Неделя отправки", "Отправлено", "Bounce", "Доставлено", "Ответы ≤3д", "≤7д", "≤14д",
            "Ответов всего", "Reply rate", "Созвонов", "Конверсия", "Когорта дозрела?"]
    ws3.append(hdr3)
    style_header(ws3, 1, len(hdr3))
    ws3.freeze_panes = "A2"
    for col, w in zip("ABCDEFGHIJKL", [14, 11, 8, 11, 10, 8, 8, 12, 10, 10, 10, 14]):
        ws3.column_dimensions[col].width = w
    for wk, m in cohort_metrics(rows).items():
        ws3.append([wk, m["sent"], m["bounced"], m["delivered"], m["replies_3d"], m["replies_7d"],
                    m["replies_14d"], m["replies_total"], m["reply_rate"], m["calls"], m["call_rate"],
                    "да" if m["mature"] else "нет (<14 дн)"])
        ws3.cell(row=ws3.max_row, column=9).number_format = "0.0%"
        ws3.cell(row=ws3.max_row, column=11).number_format = "0.0%"

    # ---- 4. Оперативная активность (календарные недели) ----
    ws4 = wb.create_sheet("Оперативная активность")
    hdr4 = ["Неделя с", "Подготовлено писем", "Подтверждено отправок", "Ответов получено",
            "Созвонов назначено", "Выводы недели (weekly.json)"]
    ws4.append(hdr4)
    style_header(ws4, 1, len(hdr4))
    for col, w in zip("ABCDEF", [12, 14, 16, 13, 14, 80]):
        ws4.column_dimensions[col].width = w
    all_dates = [d for r in rows for d in (r["created"], r["sent"], r["replied"], r["call"]) if d]
    if all_dates:
        start = monday(min(all_dates))
        end = monday(date.today()) + timedelta(weeks=1)
        wk = start
        while wk <= end:
            wk_end = wk + timedelta(days=6)
            def in_wk(d):
                return d and wk <= d <= wk_end
            note = ""
            wdata = weekly.get(wk.isoformat())
            if isinstance(wdata, dict):
                note = wdata.get("conclusions", "")
            ws4.append([
                wk, sum(1 for r in rows if in_wk(r["created"])),
                sum(1 for r in rows if in_wk(r["sent"])),
                sum(1 for r in rows if in_wk(r["replied"])),
                sum(1 for r in rows if in_wk(r["call"])), note,
            ])
            ws4.cell(row=ws4.max_row, column=1).number_format = "DD.MM.YYYY"
            ws4.cell(row=ws4.max_row, column=6).alignment = Alignment(wrap_text=True)
            wk += timedelta(weeks=1)

    # ---- 5. Эксперименты и решения ----
    ws5 = wb.create_sheet("Эксперименты и решения")
    hdr5 = ["Неделя", "ID", "Гипотеза", "Фактор", "A", "B", "Статус", "Решение"]
    ws5.append(hdr5)
    style_header(ws5, 1, len(hdr5))
    for col, w in zip("ABCDEFGH", [12, 14, 45, 16, 22, 22, 12, 40]):
        ws5.column_dimensions[col].width = w
    for wk in sorted(weekly):
        wdata = weekly.get(wk)
        if not isinstance(wdata, dict):
            continue
        for e in wdata.get("experiments", []):
            ws5.append([wk, e.get("id"), e.get("hypothesis"), e.get("factor"),
                        e.get("variant_a"), e.get("variant_b"), e.get("status"), e.get("decision")])
        for dcs in wdata.get("decisions", []):
            ws5.append([wk, dcs.get("id", "решение"), dcs.get("what_changed"), dcs.get("file"),
                        "", "", "применено", dcs.get("expected_effect")])

    if warnings:
        wsW = wb.create_sheet("Проблемы данных")
        wsW.column_dimensions["A"].width = 100
        wsW.append(["Предупреждение"])
        style_header(wsW, 1, 1)
        for w in warnings:
            wsW.append([w])

    wb.save(OUT)
    print(f"OK: {OUT}" + (f" (предупреждений: {len(warnings)})" if warnings else ""))
    for w in warnings:
        print("WARN:", w, file=sys.stderr)


def main():
    leads, weekly = load()
    rows = enrich(leads)
    if "--json" in sys.argv:
        json_mode(rows, weekly)
    else:
        xlsx_mode(rows, weekly)


if __name__ == "__main__":
    main()
