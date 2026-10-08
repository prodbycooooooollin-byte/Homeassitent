"""Rendert das Dashboard als PNG (für Discord). Läuft ohne Fenster/Browser."""
import io
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

BG, CARD, GRID, TEXT, MUTED, ACCENT = "#0f1117", "#181b24", "#262b38", "#e8eaf0", "#8b92a5", "#ff5a5f"
PALETTE = ["#ff5a5f", "#ffb347", "#4cc9f0", "#80ed99", "#b388ff", "#f72585", "#90be6d", "#f9c74f", "#577590", "#adb5bd"]


def _clean(name: str, limit: int = 16) -> str:
    """Emojis u. ä. entfernen, die die Schrift nicht darstellen kann."""
    name = re.sub(r"[^ -ɏ]", "", name).strip() or "?"
    return name if len(name) <= limit else name[: limit - 1] + "…"


def _style(ax, title: str) -> None:
    ax.set_facecolor(CARD)
    ax.set_title(title, color=MUTED, fontsize=12, loc="left", pad=10, fontweight="bold")
    ax.tick_params(colors=MUTED, labelsize=9, length=0)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.grid(axis="y", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def _label_bars(ax, bars, values) -> None:
    for b, v in zip(bars, values):
        if v:
            ax.text(b.get_x() + b.get_width() / 2, b.get_height(), str(v), ha="center", va="bottom", color=TEXT, fontsize=8)


def render(d: dict, subtitle: str = "") -> bytes:
    fig = plt.figure(figsize=(14, 8.5), dpi=110, facecolor=BG)
    gs = fig.add_gridspec(2, 6, hspace=0.42, wspace=0.9, left=0.04, right=0.98, top=0.9, bottom=0.07)
    fig.text(0.04, 0.955, "Word Counter" + (f"  ·  {subtitle}" if subtitle else ""), color=TEXT, fontsize=18, fontweight="bold")

    # 1) Tageszeit
    ax = fig.add_subplot(gs[0, :])
    _style(ax, "Tageszeit: wann fällt das Wort am häufigsten?")
    hours = list(range(24))
    bars = ax.bar(hours, d["by_hour"], color=ACCENT, width=0.72)
    if d["peak_hour"] is not None:
        bars[d["peak_hour"]].set_color("#ffb347")
    ax.set_xticks(hours)
    ax.set_xticklabels([f"{h:02d}" for h in hours])
    ax.set_xlim(-0.6, 23.6)
    _label_bars(ax, bars, d["by_hour"])

    # 2) Rangliste
    ax = fig.add_subplot(gs[1, 0:2])
    _style(ax, "Rangliste")
    ax.grid(axis="y", visible=False)
    lb = d["leaderboard"][:8][::-1]
    if lb:
        ys = range(len(lb))
        colors = PALETTE[: len(lb)][::-1] if len(lb) > 1 else [ACCENT]
        ax.barh(list(ys), [u["count"] for u in lb], color=colors, height=0.62)
        ax.set_yticks(list(ys))
        ax.set_yticklabels([_clean(u["name"]) for u in lb], color=TEXT, fontsize=10)
        mx = max(u["count"] for u in lb)
        for y, u in zip(ys, lb):
            ax.text(u["count"] + mx * 0.02, y, f'{u["count"]}  ({u["share"]}%)', va="center", color=TEXT, fontsize=9)
        ax.set_xlim(0, mx * 1.35)
        ax.set_xticks([])
        ax.grid(axis="x", visible=False)
    else:
        ax.text(0.5, 0.5, "Noch keine Daten", ha="center", va="center", color=MUTED, transform=ax.transAxes)
        ax.set_xticks([]); ax.set_yticks([])

    # 3) Wochentage
    ax = fig.add_subplot(gs[1, 2:4])
    _style(ax, "Wochentage")
    wk = d["by_weekday"]
    bars = ax.bar(wk["labels"], wk["values"], color=ACCENT, width=0.65)
    _label_bars(ax, bars, wk["values"])

    # 4) Letzte 30 Tage
    ax = fig.add_subplot(gs[1, 4:6])
    _style(ax, "Letzte 30 Tage")
    vals = d["daily"]["values"]
    xs = list(range(len(vals)))
    ax.fill_between(xs, vals, color=ACCENT, alpha=0.2)
    ax.plot(xs, vals, color=ACCENT, linewidth=2.2, marker="o", markersize=3.5)
    ax.set_xticks([0, len(vals) // 2, len(vals) - 1])
    ax.set_xticklabels([d["daily"]["labels"][0], d["daily"]["labels"][len(vals) // 2], d["daily"]["labels"][-1]])
    ax.set_ylim(bottom=0)

    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=BG)
    plt.close(fig)
    return buf.getvalue()
