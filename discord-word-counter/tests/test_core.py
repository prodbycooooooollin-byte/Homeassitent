import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from matcher import count_hits
from db import Store


def test_matcher():
    assert count_hits("hallo zusammen, wie geht's") == 0
    assert count_hits("Nigger") == 1
    assert count_hits("nigga nigga, niggas") == 3
    assert count_hits("n i g g e r") == 1
    assert count_hits("Nigeria und Niger sind Länder") == 0
    assert count_hits("niga nikka nikker nigha") == 3 + 1  # Whisper-Schreibweisen


def test_store(tmp_path):
    s = Store(str(tmp_path / "t.db"))
    s.add(1, 10, 2); s.add(1, 20, 5); s.add(1, 10, 1)
    assert s.top(1) == [(20, 5), (10, 3)]
    s.set_optout(1, 20, True)
    s.add(1, 20, 3)
    assert s.get(1, 20) == 0
    s.set_optout(1, 20, False)
    s.add(1, 20, 1)
    assert s.get(1, 20) == 1


def test_stats():
    from datetime import datetime
    from zoneinfo import ZoneInfo
    from stats import compute
    tz = ZoneInfo("Europe/Berlin")
    now = datetime(2026, 10, 8, 12, 0, tzinfo=tz)
    ts = lambda d, h: int(datetime(2026, 10, d, h, 30, tzinfo=tz).timestamp())
    ev = [(1, ts(8, 22), 2), (1, ts(7, 22), 1), (2, ts(8, 3), 1)]
    r = compute(ev, {1: "Anna"}, now=now)
    assert r["total"] == 4 and r["today"] == 3 and r["streak"] == 2
    assert r["peak_hour"] == 22 and r["top_user"]["name"] == "Anna"
    assert r["leaderboard"][1]["name"].startswith("User")
