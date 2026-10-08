"""Berechnet alle Dashboard-Kennzahlen aus den Einzelereignissen."""
from collections import Counter
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def compute(events: list[tuple[int, int, int]], names: dict[int, str], tz: str = "Europe/Berlin",
            now: datetime | None = None) -> dict:
    zone = ZoneInfo(tz)
    now = now or datetime.now(zone)
    today = now.date()

    per_user: Counter = Counter()
    by_hour = [0] * 24
    by_weekday = [0] * 7
    by_day: Counter = Counter()
    user_hours: dict[int, list[int]] = {}
    total = 0
    for uid, ts, n in events:
        d = datetime.fromtimestamp(ts, zone)
        total += n
        per_user[uid] += n
        by_hour[d.hour] += n
        by_weekday[d.weekday()] += n
        by_day[d.date()] += n
        user_hours.setdefault(uid, [0] * 24)[d.hour] += n

    def name(uid: int) -> str:
        return names.get(uid, f"User {str(uid)[-4:]}")

    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    best_day = max(by_day.items(), key=lambda kv: kv[1]) if by_day else None
    peak_hour = max(range(24), key=lambda h: by_hour[h]) if total else None
    last7 = sum(by_day.get(today - timedelta(days=i), 0) for i in range(7))

    # aktuelle Serie: aufeinanderfolgende Tage (bis heute/gestern) mit mindestens einem Treffer
    streak, cur = 0, today if by_day.get(today) else today - timedelta(days=1)
    while by_day.get(cur):
        streak += 1
        cur -= timedelta(days=1)

    return {
        "total": total,
        "today": by_day.get(today, 0),
        "last7": last7,
        "streak": streak,
        "peak_hour": peak_hour,
        "best_day": {"date": best_day[0].isoformat(), "count": best_day[1]} if best_day else None,
        "top_user": {"name": name(per_user.most_common(1)[0][0]), "count": per_user.most_common(1)[0][1]}
        if per_user else None,
        "leaderboard": [{"name": name(u), "count": c, "share": round(100 * c / total, 1)}
                        for u, c in per_user.most_common(10)],
        "by_hour": by_hour,
        "by_weekday": {"labels": WEEKDAYS, "values": by_weekday},
        "daily": {"labels": [d.strftime("%d.%m.") for d in days], "values": [by_day.get(d, 0) for d in days]},
        "user_peak": [{"name": name(u), "hour": max(range(24), key=lambda h: hrs[h])}
                      for u, hrs in sorted(user_hours.items(), key=lambda kv: -per_user[kv[0]])[:10]],
    }
