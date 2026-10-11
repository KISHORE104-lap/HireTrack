# api/chart.py  ->  URL: /api/chart   (a Python serverless function on Vercel)
#
# Draws the dashboard charts with the Python library "pygal", which turns numbers into SVG images.
# The browser sends the counts, this function returns the finished charts as SVG text.
#
#   POST /api/chart
#   body:  {"stages": {"Applied": 3, ...}, "weekly": [{"label": "6 Oct", "count": 2}, ...], "theme": "light"}
#   reply: {"stageChart": "<svg ...>", "weeklyChart": "<svg ...>"}

import json
from http.server import BaseHTTPRequestHandler

try:
    import pygal  # the chart library (installed by Vercel from api/requirements.txt)
    from pygal.style import Style
    HAVE_PYGAL = True
except ImportError:  # if it is missing, the plain-Python fallback below draws the charts
    HAVE_PYGAL = False

STAGES = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"]
STAGE_COLORS = {
    "light": ("#6B6F80", "#2F6FDB", "#B06E04", "#1F8A5B", "#B4413C"),
    "dark": ("#A3A7B8", "#7AA7F0", "#E3A944", "#5CC795", "#EB817B"),
}
TEXT = {
    "light": {"soft": "#5D5B78", "strong": "#1D1B3A", "grid": "#E1DFEE", "accent": "#4B3FD6"},
    "dark": {"soft": "#A9A7C2", "strong": "#ECEBF5", "grid": "#34314A", "accent": "#8F86F5"},
}


def make_style(theme, colors):
    t = TEXT[theme]
    return Style(
        background="transparent",
        plot_background="transparent",
        foreground=t["soft"],
        foreground_strong=t["strong"],
        foreground_subtle=t["grid"],
        colors=colors,
        font_family="Figtree, Segoe UI, sans-serif",
        label_font_size=20,
        major_label_font_size=20,
        value_font_size=22,
        value_colors=(t["strong"],),
        legend_font_size=22,
        title_font_size=22,
        tooltip_font_size=18,
        opacity=0.95,
        opacity_hover=1,
    )


def clean_count(value):
    """Turn anything into a whole number between 0 and 10000."""
    try:
        return max(0, min(10000, int(value)))
    except (TypeError, ValueError):
        return 0


def render(data):
    theme = "dark" if data.get("theme") == "dark" else "light"
    stages = data.get("stages") or {}
    weekly = (data.get("weekly") or [])[:12]
    if not HAVE_PYGAL:
        t = TEXT[theme]
        return {
            "stageChart": svg_donut(STAGES, [clean_count(stages.get(s)) for s in STAGES], STAGE_COLORS[theme], t["strong"], t["soft"]),
            "weeklyChart": svg_bars([str(w.get("label", ""))[:12] for w in weekly], [clean_count(w.get("count")) for w in weekly],
                                    t["accent"], t["strong"], t["soft"], t["grid"]),
        }
    common = dict(disable_xml_declaration=True, js=[], explicit_size=False, margin=12)

    # Chart 1: donut of applications by stage
    donut = pygal.Pie(
        inner_radius=0.62,
        style=make_style(theme, STAGE_COLORS[theme]),
        legend_box_size=18,
        truncate_legend=-1,
        print_values=False,
        width=640,
        height=380,
        **common,
    )
    for stage in STAGES:
        donut.add(stage, clean_count(stages.get(stage)))

    # Chart 2: bars of applications sent per week
    bars = pygal.Bar(
        style=make_style(theme, (TEXT[theme]["accent"],)),
        show_legend=False,
        print_values=True,
        print_values_position="top",
        truncate_label=-1,
        show_y_guides=True,
        width=640,
        height=380,
        **common,
    )
    counts = [clean_count(w.get("count")) for w in weekly]
    bars.x_labels = [str(w.get("label", ""))[:12] for w in weekly]
    top = max(counts + [1])
    step = max(1, -(-top // 5))  # whole-number axis: 0, step, 2*step ...
    bars.y_labels = list(range(0, top + step + 1, step))
    bars.add("Applications", counts)

    return {"stageChart": donut.render(is_unicode=True), "weeklyChart": bars.render(is_unicode=True)}


# ---------- Fallback: plain-Python SVG charts (used if pygal is not installed) ----------
def _esc(text):
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_donut(labels, values, colors, ink, soft):
    import math
    total = sum(values) or 1
    cx, cy, r, w = 440, 190, 140, 52
    parts, angle = [], -math.pi / 2
    for value, color in zip(values, colors):
        if value <= 0:
            continue
        sweep = 2 * math.pi * value / total
        if sweep >= 2 * math.pi - 1e-6:
            parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="{w}"/>')
        else:
            x1, y1 = cx + r * math.cos(angle), cy + r * math.sin(angle)
            x2, y2 = cx + r * math.cos(angle + sweep), cy + r * math.sin(angle + sweep)
            large = 1 if sweep > math.pi else 0
            parts.append(f'<path d="M{x1:.1f} {y1:.1f} A{r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" fill="none" stroke="{color}" stroke-width="{w}"/>')
        angle += sweep
    legend = "".join(
        f'<rect x="20" y="{30 + i * 34}" width="18" height="18" fill="{c}"/>'
        f'<text x="48" y="{45 + i * 34}" font-size="22" fill="{soft}">{_esc(l)} ({v})</text>'
        for i, (l, v, c) in enumerate(zip(labels, values, colors))
    )
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" font-family="sans-serif">'
            f'{legend}{"".join(parts)}<text x="{cx}" y="{cy + 12}" text-anchor="middle" font-size="36" font-weight="700" fill="{ink}">{sum(values)}</text></svg>')


def svg_bars(labels, values, color, ink, soft, grid):
    top = max(values + [1])
    n = max(len(values), 1)
    left, right, y0, y1 = 60, 620, 40, 320
    slot = (right - left) / n
    out = [f'<line x1="{left}" y1="{y1}" x2="{right}" y2="{y1}" stroke="{grid}" stroke-width="2"/>']
    for i, (label, value) in enumerate(zip(labels, values)):
        h = (y1 - y0) * value / top
        x = left + i * slot + slot * 0.18
        bw = slot * 0.64
        out.append(f'<rect x="{x:.1f}" y="{y1 - h:.1f}" width="{bw:.1f}" height="{h:.1f}" rx="4" fill="{color}"/>')
        out.append(f'<text x="{x + bw / 2:.1f}" y="{y1 - h - 10:.1f}" text-anchor="middle" font-size="22" fill="{ink}">{value}</text>')
        out.append(f'<text x="{x + bw / 2:.1f}" y="{y1 + 32}" text-anchor="middle" font-size="18" fill="{soft}">{_esc(label)}</text>')
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" font-family="sans-serif">{"".join(out)}</svg>'


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = min(int(self.headers.get("Content-Length") or 0), 20000)
            data = json.loads(self.rfile.read(length) or b"{}")
            status, body = 200, render(data if isinstance(data, dict) else {})
        except Exception as error:  # bad JSON or anything unexpected
            status, body = 400, {"errors": ["Could not draw the charts: " + str(error)[:120]]}
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


# Local testing: echo '{"stages":{"Applied":2}}' | python3 api/chart.py
if __name__ == "__main__":
    import sys
    print(json.dumps(render(json.load(sys.stdin))))
