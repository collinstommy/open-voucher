#!/usr/bin/env python3
"""Generate a read-only HTML moderation report from Convex production data."""

from __future__ import annotations

import argparse
import html
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


REWARDS = {"5": 15, "10": 10, "20": 5, "0": 0}

QUERY = r'''const users = await ctx.db.query("users").collect();
const targets = users.filter((u) => u.isBanned === true || (u.flaggedForReviewAt !== undefined && u.isBanned === false));
const chats = new Set(targets.map((u) => u.telegramChatId));
const allMessages = await ctx.db.query("messages").collect();
return await Promise.all(targets.map(async (user) => {
  const [uploads, reportsAgainst, reportsFiled, feedback] = await Promise.all([
    ctx.db.query("vouchers").withIndex("by_uploader_created", (q) => q.eq("uploaderId", user._id)).collect(),
    ctx.db.query("reports").withIndex("by_uploader", (q) => q.eq("uploaderId", user._id)).collect(),
    ctx.db.query("reports").withIndex("by_reporterId", (q) => q.eq("reporterId", user._id)).collect(),
    ctx.db.query("feedback").withIndex("by_user", (q) => q.eq("userId", user._id)).collect(),
  ]);
  return {
    user: { _id: user._id, telegramChatId: user.telegramChatId, username: user.username, firstName: user.firstName, coins: user.coins, isBanned: user.isBanned, bannedAt: user.bannedAt, flaggedForReviewAt: user.flaggedForReviewAt, uploadCount: user.uploadCount ?? 0, claimCount: user.claimCount ?? 0, uploadReportCount: user.uploadReportCount ?? 0, claimReportCount: user.claimReportCount ?? 0 },
    uploads,
    reportsAgainst,
    reportsFiled,
    feedback,
    messages: allMessages.filter((m) => chats.has(m.telegramChatId) && m.telegramChatId === user.telegramChatId),
  };
}));'''


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-dir", default="packages/backend")
    parser.add_argument("--output", required=True)
    parser.add_argument("--prod", action="store_true")
    parser.add_argument("--deployment")
    return parser.parse_args()


def run_query(args: argparse.Namespace) -> list[dict]:
    command = ["bunx", "convex", "run"]
    if args.prod:
        command.append("--prod")
    elif args.deployment:
        command += ["--deployment", args.deployment]
    command += ["--inline-query", QUERY]
    result = subprocess.run(command, cwd=args.backend_dir, text=True, capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    raw = result.stdout.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]")
        if start < 0 or end < start:
            raise RuntimeError(f"Could not parse Convex output:\n{raw[:1000]}")
        return json.loads(raw[start : end + 1])


def ts(value: int | None) -> str:
    if not value:
        return "Unknown"
    return datetime.fromtimestamp(value / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def count_after(items: list[dict], cutoff: int | None) -> tuple[int, int]:
    if cutoff is None:
        return (0, 0)
    return (sum(i.get("createdAt", 0) < cutoff for i in items), sum(i.get("createdAt", 0) >= cutoff for i in items))


def analyze(case: dict) -> dict:
    user = case["user"]
    uploads = case["uploads"]
    against = case["reportsAgainst"]
    filed = case["reportsFiled"]
    messages = case["messages"]
    feedback = case["feedback"]
    admin_messages = [m for m in messages if m.get("isAdminMessage") is True]
    cutoff = max((m.get("createdAt", 0) for m in admin_messages), default=None) if not user["isBanned"] else user.get("bannedAt")
    upload_rate = len(against) / len(uploads) if uploads else 0
    claim_rate = len(filed) / user.get("claimCount", 0) if user.get("claimCount", 0) else 0
    score = round((upload_rate * 0.65 + claim_rate * 0.35) * 100)
    reported_ids = {r["voucherId"] for r in against}
    reported_uploads = [v for v in uploads if v["_id"] in reported_ids]
    deduction = sum(REWARDS.get(v.get("type", "0"), 0) for v in reported_uploads)
    before_uploads, after_uploads = count_after(uploads, cutoff)
    before_against, after_against = count_after(against, cutoff)
    before_filed, after_filed = count_after(filed, cutoff)
    before_feedback, after_feedback = count_after(feedback, user.get("bannedAt"))
    inbound = [m for m in messages if m.get("direction") == "inbound" and m.get("isAdminMessage") is not True]
    before_inbound, after_inbound = count_after(inbound, user.get("bannedAt"))
    confidence = min(100, round(((len(uploads) + user.get("claimCount", 0)) / 20) * 100))
    if user["isBanned"]:
        suggestion = "Review support/feedback and post-ban activity"
    elif admin_messages and after_against == 0:
        suggestion = "Monitor; warning appears effective"
    elif admin_messages and after_against > 0:
        suggestion = "Consider deduction for confirmed reported uploads; escalate to ban review"
    elif score >= 40:
        suggestion = "Send warning and review recent uploads"
    elif score >= 20:
        suggestion = "Monitor closely; consider warning"
    else:
        suggestion = "Monitor"
    return {"user": user, "uploads": uploads, "against": against, "filed": filed, "messages": messages, "feedback": feedback, "admin_messages": admin_messages, "cutoff": cutoff, "score": score, "confidence": confidence, "deduction": deduction, "reported_uploads": reported_uploads, "before_uploads": before_uploads, "after_uploads": after_uploads, "before_against": before_against, "after_against": after_against, "before_filed": before_filed, "after_filed": after_filed, "before_feedback": before_feedback, "after_feedback": after_feedback, "before_inbound": before_inbound, "after_inbound": after_inbound, "suggestion": suggestion}


def cell(value: object) -> str:
    return html.escape(str(value))


def render(cases: list[dict]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    flagged = sorted((c for c in cases if not c["user"]["isBanned"]), key=lambda c: (-c["score"], -len(c["against"])))
    banned = sorted((c for c in cases if c["user"]["isBanned"]), key=lambda c: -(c["user"].get("bannedAt") or 0))

    def rows(items: list[dict], banned_table: bool = False) -> str:
        output = []
        for c in items:
            u = c["user"]
            name = u.get("firstName") or "(no name)"
            if u.get("username"):
                name += f" (@{u['username']})"
            period = f"{c['before_against']} / {c['after_against']} reports"
            if banned_table:
                period = f"{c['before_inbound']} / {c['after_inbound']} inbound messages"
            status = "banned" if u["isBanned"] else "flagged"
            output.append(f"<tr><td><strong>{cell(name)}</strong><small class=\"sub\">{cell(u.get('telegramChatId'))}</small></td><td><span class=\"pill {status}\">{cell(status)}</span></td><td><div class=\"score\"><strong>{cell(c['score'])}%</strong><span><i style=\"width:{min(c['score'], 100)}%\"></i></span></div><small>{c['confidence']}% confidence</small></td><td>{cell(len(c['uploads']))}</td><td><strong>{cell(len(c['against']))}</strong> <span class=\"muted\">/ {cell(len(c['filed']))}</span></td><td><strong>{cell(c['deduction'])}</strong> <span class=\"muted\">coins</span></td><td>{cell(period)}</td><td class=\"action\">{cell(c['suggestion'])}</td></tr>")
        return "\n".join(output) or '<tr><td colspan="8">None</td></tr>'

    detail_blocks = []
    for c in cases:
        u = c["user"]
        name = u.get("firstName") or "(no name)"
        warning_lines = "".join(f"<li>{cell(ts(m.get('createdAt')))}: {cell(m.get('text') or '(no text)')}</li>" for m in c["admin_messages"]) or "<li>No admin messages recorded</li>"
        feedback_lines = "".join(f"<li>{cell(ts(f.get('createdAt')))} [{cell(f.get('type') or 'unspecified')}]: {cell(f.get('text') or '')}</li>" for f in sorted(c["feedback"], key=lambda x: x.get("createdAt", 0))) or "<li>No feedback records</li>"
        inbound_lines = "".join(f"<li>{cell(ts(m.get('createdAt')))}: {cell(m.get('text') or '(no text)')}</li>" for m in sorted((m for m in c["messages"] if m.get("direction") == "inbound" and m.get("isAdminMessage") is not True), key=lambda x: x.get("createdAt", 0))) or "<li>No inbound messages recorded</li>"
        detail_blocks.append(f"<details><summary>{cell(name)} ({cell('banned' if u['isBanned'] else 'flagged')})</summary><p><b>Intervention:</b> {cell(ts(c['cutoff']))} | <b>Score:</b> {c['score']}% | <b>Estimated deduction:</b> {c['deduction']} coins</p><h4>Admin messages</h4><ul>{warning_lines}</ul><h4>Inbound Telegram messages</h4><ul>{inbound_lines}</ul><h4>Feedback and support records</h4><ul>{feedback_lines}</ul></details>")
    summary = f"<div class=\"summary\"><div><span>Flagged</span><strong>{len(flagged)}</strong></div><div><span>Banned</span><strong>{len(banned)}</strong></div><div><span>Known warnings</span><strong>{sum(bool(c['admin_messages']) for c in cases)}</strong></div><div><span>Traceable deduction</span><strong>{sum(c['deduction'] for c in cases)} <em>coins</em></strong></div></div>"
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Band Review Analysis</title><style>
:root{{--background:#fff;--foreground:#171717;--muted:#737373;--border:#e5e5e5;--surface:#fafafa;--primary:#171717;--warning:#b45309;--danger:#b42318;--green:#18794e;--radius:10px}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--background);color:var(--foreground);font:14px/1.5 Inter,Geist,ui-sans-serif,system-ui,sans-serif}}main{{max-width:1480px;margin:0 auto;padding:48px 28px 72px}}header{{border-bottom:1px solid var(--border);padding-bottom:28px;margin-bottom:24px;display:flex;justify-content:space-between;gap:24px;align-items:end}}.eyebrow{{color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}}h1{{font-size:clamp(28px,4vw,46px);letter-spacing:-.05em;line-height:1;margin:0}}h2{{font-size:20px;letter-spacing:-.03em;margin:36px 0 10px}}h4{{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:22px 0 7px}}.note{{color:var(--muted);font-size:12px;max-width:520px;margin:0;text-align:right}}.summary{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 34px}}.summary div{{border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;background:linear-gradient(145deg,#fff,#fafafa)}}.summary span{{display:block;color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}}.summary strong{{display:block;font-size:28px;letter-spacing:-.05em;margin-top:6px}}.summary em{{font-size:12px;font-style:normal;color:var(--muted);letter-spacing:0}}.table-wrap{{border:1px solid var(--border);border-radius:var(--radius);overflow:auto;box-shadow:0 1px 2px #00000008}}table{{border-collapse:collapse;width:100%;min-width:1050px}}th,td{{border-bottom:1px solid var(--border);padding:12px 13px;text-align:left;vertical-align:middle}}th{{background:var(--surface);color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;white-space:nowrap}}tbody tr:last-child td{{border-bottom:0}}tbody tr:hover{{background:#fcfcfc}}td:first-child{{min-width:150px}}.sub{{display:block;color:var(--muted);font-size:11px;margin-top:2px}}.muted,small{{color:var(--muted)}}.pill{{display:inline-flex;border:1px solid;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}}.pill.flagged{{color:var(--warning);border-color:#f3c98b;background:#fffaf0}}.pill.banned{{color:var(--danger);border-color:#efb4ae;background:#fff7f6}}.score{{display:flex;align-items:center;gap:9px;min-width:105px}}.score strong{{font-size:16px;letter-spacing:-.03em}}.score span{{display:block;background:#eee;height:5px;border-radius:9px;overflow:hidden;width:54px}}.score i{{display:block;height:100%;background:var(--primary);border-radius:9px}}.action{{max-width:250px;color:#404040;font-size:12px}}details{{border:1px solid var(--border);border-radius:var(--radius);padding:0 16px;margin:9px 0;background:#fff}}details[open]{{box-shadow:0 4px 16px #00000008}}summary{{cursor:pointer;font-weight:700;padding:14px 0}}summary::marker{{color:var(--muted)}}details p{{border-top:1px solid var(--border);padding-top:13px;color:#404040}}ul{{padding-left:20px;margin:8px 0 18px}}li{{margin:7px 0;white-space:pre-wrap;color:#404040}}@media(max-width:700px){{main{{padding:28px 14px 48px}}header{{display:block}}.note{{text-align:left;margin-top:14px}}.summary{{grid-template-columns:repeat(2,1fr)}}.summary strong{{font-size:24px}}h2{{margin-top:28px}}}}
</style></head><body><main><header><div><p class="eyebrow">Moderation console / read-only</p><h1>Band review</h1></div><p class="note">Generated {cell(now)}<br>Scores are heuristics, not proof of abuse.</p></header>{summary}<h2>Flagged users <small>review queue</small></h2><div class="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Abuse score</th><th>Uploads</th><th>Upload / filed reports</th><th>Est. deduction</th><th>Before / after</th><th>Suggested action</th></tr></thead><tbody>{rows(flagged)}</tbody></table></div><h2>Banned users <small>follow-up signals</small></h2><div class="table-wrap"><table><thead><tr><th>User</th><th>Status</th><th>Abuse score</th><th>Uploads</th><th>Upload / filed reports</th><th>Est. deduction</th><th>Before / after ban</th><th>Suggested action</th></tr></thead><tbody>{rows(banned, True)}</tbody></table></div><h2>Case details</h2>{''.join(detail_blocks)}</main></body></html>"""


def main() -> None:
    args = parse_args()
    cases = [analyze(case) for case in run_query(args)]
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render(cases), encoding="utf-8")
    print(f"Wrote {output} for {len(cases)} users ({sum(not c['user']['isBanned'] for c in cases)} flagged, {sum(c['user']['isBanned'] for c in cases)} banned)")


if __name__ == "__main__":
    main()
