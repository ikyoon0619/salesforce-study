#!/usr/bin/env python3
"""콘텐츠 JSON 검사기.

사용법:  python3 tools/validate.py
- data/certs.json 에 등록된 모든 자격증 파일을 읽고
- 섹션 비중 합계가 100인지, 문제 id가 겹치지 않는지, 정답 번호가 보기 범위 안인지,
  보기별 해설(notes) 개수가 보기 개수와 같은지 등을 확인한다.
문제가 있으면 목록을 출력하고 종료 코드 1로 끝난다 (CI에서 쓰기 좋게).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIRED_READY_KEYS = ("summary", "concepts")


def check_cert(path: Path) -> list[str]:
    errors: list[str] = []
    data = json.loads(path.read_text(encoding="utf-8"))
    name = path.name

    for key in ("id", "name", "exam", "sections", "questions"):
        if key not in data:
            errors.append(f"{name}: '{key}' 항목이 없음")
    if errors:
        return errors

    total = sum(s["weight"] for s in data["sections"])
    if total != 100:
        errors.append(f"{name}: 섹션 비중 합계가 {total}% (100%여야 함)")

    section_ids = [s["id"] for s in data["sections"]]
    if len(section_ids) != len(set(section_ids)):
        errors.append(f"{name}: 섹션 id 중복")

    for s in data["sections"]:
        if s.get("status") == "ready":
            for key in REQUIRED_READY_KEYS:
                if not s.get(key):
                    errors.append(f"{name}: 섹션 '{s['id']}' 이 ready인데 '{key}' 가 비어 있음")
        for m in s.get("trail", []):
            for key in ("title", "url", "minutes", "kind", "topics"):
                if key not in m:
                    errors.append(f"{name}: 섹션 '{s['id']}' 트레일 모듈 '{m.get('title', '?')}' 에 '{key}' 없음")
            if not str(m.get("url", "")).startswith("https://trailhead.salesforce.com/"):
                errors.append(f"{name}: 트레일 모듈 URL이 Trailhead가 아님: {m.get('url')}")
        for t in s.get("tables", []):
            width = len(t["headers"])
            for row in t["rows"]:
                if len(row) != width:
                    errors.append(f"{name}: 표 '{t['title']}' 의 행 칸 수가 {len(row)} (헤더 {width})")

    for s in data["sections"]:
        for m in s.get("trail", []):
            if m.get("note"):
                note_path = ROOT / "data" / "notes" / m.get("noteFrom", data["id"]) / f"{m['note']}.json"
                if not note_path.exists():
                    errors.append(f"{name}: 노트 파일 없음 {note_path.relative_to(ROOT)}")
                    continue
                errors += check_note(note_path)

    seen: set[str] = set()
    for q in data["questions"]:
        qid = q.get("id", "?")
        where = f"{name}: 문제 {qid}"
        if qid in seen:
            errors.append(f"{where}: id 중복")
        seen.add(qid)
        if q.get("section") not in section_ids:
            errors.append(f"{where}: 없는 섹션 '{q.get('section')}'")
        opts = q.get("options", [])
        if len(opts) < 2:
            errors.append(f"{where}: 보기가 2개 미만")
        if len(set(opts)) != len(opts):
            errors.append(f"{where}: 같은 보기가 중복됨")
        ans = q.get("answer", [])
        if not ans or not all(isinstance(i, int) and 0 <= i < len(opts) for i in ans):
            errors.append(f"{where}: 정답 번호 {ans} 가 보기 범위를 벗어남")
        if len(set(ans)) != len(ans):
            errors.append(f"{where}: 정답 번호 중복")
        if len(ans) >= len(opts):
            errors.append(f"{where}: 모든 보기가 정답임")
        notes = q.get("notes")
        if notes is not None and len(notes) != len(opts):
            errors.append(f"{where}: notes {len(notes)}개, 보기 {len(opts)}개")
        if not q.get("explain"):
            errors.append(f"{where}: 해설(explain) 없음")
    return errors


NOTE_BLOCKS = {"p": ("text",), "list": ("items",), "steps": ("items",), "table": ("headers", "rows"),
               "figure": ("svg",), "tip": ("text",), "path": ("text",), "code": ("code",)}


def check_note(path: Path) -> list[str]:
    errors: list[str] = []
    note = json.loads(path.read_text(encoding="utf-8"))
    where = path.relative_to(ROOT)
    if not note.get("intro") or not note.get("units"):
        errors.append(f"{where}: intro 또는 units 없음")
        return errors
    for i, u in enumerate(note["units"], 1):
        if not u.get("title") or not str(u.get("url", "")).startswith("https://trailhead.salesforce.com/"):
            errors.append(f"{where}: unit {i} 제목 또는 Trailhead URL 없음")
        for b in u.get("blocks", []):
            need = NOTE_BLOCKS.get(b.get("type"))
            if need is None:
                errors.append(f"{where}: unit {i} 알 수 없는 블록 '{b.get('type')}'")
                continue
            for key in need:
                if key not in b:
                    errors.append(f"{where}: unit {i} '{b['type']}' 블록에 '{key}' 없음")
            if b["type"] == "figure":
                svg = b.get("svg", "")
                if not svg.startswith("<svg") or "viewBox" not in svg or "<script" in svg:
                    errors.append(f"{where}: unit {i} 다이어그램 SVG 형식 오류")
            if b["type"] == "table":
                for row in b.get("rows", []):
                    if len(row) != len(b["headers"]):
                        errors.append(f"{where}: unit {i} 표 행 칸 수 불일치")
    return errors


def main() -> int:
    registry = json.loads((ROOT / "data" / "certs.json").read_text(encoding="utf-8"))
    errors: list[str] = []
    summary: list[str] = []
    for entry in registry["certs"]:
        if not entry.get("file"):
            continue
        path = ROOT / entry["file"]
        if not path.exists():
            errors.append(f"{entry['id']}: 파일 없음 {entry['file']}")
            continue
        errors += check_cert(path)
        data = json.loads(path.read_text(encoding="utf-8"))
        per = {s["id"]: 0 for s in data["sections"]}
        for q in data["questions"]:
            per[q["section"]] = per.get(q["section"], 0) + 1
        counts = ", ".join(f"{k} {v}" for k, v in per.items())
        summary.append(f"{entry['id']}: 문제 {len(data['questions'])}개 ({counts})")

    print("\n".join(summary))
    if errors:
        print(f"\n문제 {len(errors)}건:")
        print("\n".join(f"  - {e}" for e in errors))
        return 1
    print("\n검사 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
