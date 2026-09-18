"""Prints 1 if any slate game is "live" — worth refreshing every 5 minutes — else 0.
Live = an event has an open market that expires within the next 30 hours, or a market that closed in the last 8 hours and
has no result yet (settlement pending). Quiet periods are left to the 5-minute cron; the loop only runs around games."""
import json, sys
from datetime import datetime, timedelta, timezone

def parse(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None
    except ValueError:
        return None

doc = json.load(open(sys.argv[1], encoding="utf-8"))
now = datetime.now(timezone.utc)
live = False
for ev in (doc.get("events") or {}).values():
    for m in ev.get("markets") or []:
        exp = parse(m.get("expected_expiration_time") or m.get("close_time"))
        if not exp:
            continue
        if m.get("status") in ("open", "active") and now - timedelta(hours=1) <= exp <= now + timedelta(hours=30):
            live = True
        if m.get("status") not in ("open", "active") and not (m.get("result") or "") and now - timedelta(hours=8) <= exp <= now + timedelta(hours=8):
            live = True
print("1" if live else "0")

# Board now includes college football (KXNCAAFGAME) alongside the NFL; the window logic is series-agnostic.
