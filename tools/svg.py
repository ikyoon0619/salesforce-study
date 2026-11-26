"""모듈 노트용 다이어그램을 만드는 작은 도우미.

색은 직접 쓰지 않고 CSS 클래스(d-box, d-accent, d-text …)만 쓴다.
그래서 라이트/다크 테마에서 자동으로 맞는 색이 된다 (assets/css/style.css 참고).
"""
from __future__ import annotations

from html import escape


class Diagram:
    def __init__(self, width: int, height: int, label: str):
        self.w, self.h, self.label = width, height, label
        self.parts: list[str] = []

    def box(self, x, y, w, h, title, sub=None, kind="box", rx=10):
        self.parts.append(f'<rect class="d-{kind}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>')
        lines = [title] if isinstance(title, str) else title
        sub_lines = [] if sub is None else ([sub] if isinstance(sub, str) else sub)
        total = len(lines) * 19 + len(sub_lines) * 16
        cy = y + h / 2 - total / 2 + 14
        for t in lines:
            self.parts.append(f'<text class="d-strong" x="{x + w / 2}" y="{cy}" text-anchor="middle">{escape(t)}</text>')
            cy += 19
        for t in sub_lines:
            self.parts.append(f'<text class="d-sub" x="{x + w / 2}" y="{cy}" text-anchor="middle">{escape(t)}</text>')
            cy += 16
        return self

    def text(self, x, y, s, kind="text", anchor="middle"):
        self.parts.append(f'<text class="d-{kind}" x="{x}" y="{y}" text-anchor="{anchor}">{escape(s)}</text>')
        return self

    def arrow(self, x1, y1, x2, y2, label=None, kind="line", dashed=False, both=False, label_dy=-8):
        cls = "d-dash" if dashed else f"d-{kind}"
        head = "d-arrow-accent" if kind == "line-accent" else "d-arrow"
        self.parts.append(f'<line class="{cls}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
        self.parts.append(self._head(x1, y1, x2, y2, head))
        if both:
            self.parts.append(self._head(x2, y2, x1, y1, head))
        if label:
            if x1 == x2:  # 세로 화살표는 선과 겹치지 않게 오른쪽에 표시
                self.text(x1 + 8 + 6 * len(label), (y1 + y2) / 2 + 4, label, "sub")
            else:
                self.text((x1 + x2) / 2, (y1 + y2) / 2 + label_dy, label, "sub")
        return self

    @staticmethod
    def _head(x1, y1, x2, y2, cls):
        import math
        a = math.atan2(y2 - y1, x2 - x1)
        s = 9
        p1 = (x2 - s * math.cos(a - 0.45), y2 - s * math.sin(a - 0.45))
        p2 = (x2 - s * math.cos(a + 0.45), y2 - s * math.sin(a + 0.45))
        return f'<polygon class="{cls}" points="{x2:.1f},{y2:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"/>'

    def svg(self) -> str:
        body = "".join(self.parts)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" role="img" '
                f'aria-label="{escape(self.label)}">{body}</svg>')
