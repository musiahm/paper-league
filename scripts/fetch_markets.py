"""Writes markets.json: every Kalshi market (any status) for every game on the league's slate.
Runs in GitHub Actions every 5 minutes (see .github/workflows/kalshi.yml); no dependencies beyond the standard library.
    python scripts/fetch_markets.py --sheet-id <id> --slate-gid <gid> --out markets.json"""
import argparse, csv, io, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone

KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
KEEP = ("ticker", "event_ticker", "status", "result", "yes_bid_dollars", "yes_ask_dollars", "no_bid_dollars", "no_ask_dollars", "last_price_dollars",
        "volume_fp", "open_interest_fp", "floor_strike", "close_time", "expected_expiration_time", "occurrence_datetime", "updated_time", "title", "yes_sub_title")
EVENT_RE = re.compile(r"^(KX[A-Z]+?)GAME-(\d{2}[A-Z]{3}\d{2}[A-Z]+)")


def get(url, params=None, tries=3):
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "paper-league/1.0 (+https://musiahm.github.io/paper-league/)", "Accept": "application/json, text/csv"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def slate_rows(sheet_id, gid):
    text = get(f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}")
    rows = []
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        r = {(k or "").strip(): (v or "").strip() for k, v in r.items()}
        t = r.get("event_ticker") or r.get("YES ticker — home") or r.get("YES ticker — away") or ""
        m = EVENT_RE.match(t)
        if not m:
            continue
        rows.append({"event_ticker": f"{m.group(1)}GAME-{m.group(2)}", "base": m.group(1), "suffix": m.group(2), "game": r.get("game (away @ home)") or r.get("game") or "",
                     "kickoff": r.get("kickoff (ET)") or r.get("kickoff") or "", "in_slate": r.get("in slate?") or r.get("in_slate") or "", "note": r.get("notes") or r.get("note") or ""})
    return rows


def markets_for(event_ticker):
    out, cursor = [], None
    for _ in range(10):
        params = {"event_ticker": event_ticker, "limit": 200}
        if cursor:
            params["cursor"] = cursor
        body = json.loads(get(f"{KALSHI}/markets", params))
        out.extend({k: m.get(k) for k in KEEP} for m in body.get("markets") or [])
        cursor = body.get("cursor")
        if not cursor:
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet-id", required=True)
    ap.add_argument("--slate-gid", required=True)
    ap.add_argument("--out", default="markets.json")
    ap.add_argument("--all", action="store_true", help="fetch every slate row, not only the ones marked yes")
    a = ap.parse_args()
    errors, events = [], {}
    try:
        slate = slate_rows(a.sheet_id, a.slate_gid)
    except Exception as e:  # noqa: BLE001
        errors.append(f"slate: {e}")
        slate = []
    for s in slate:
        if not a.all and s["in_slate"].lower() not in ("yes", "y", "true"):
            continue
        ev = {"event_ticker": s["event_ticker"], "markets": []}
        try:
            info = json.loads(get(f"{KALSHI}/events/{s['event_ticker']}")).get("event") or {}
            ev.update({"title": info.get("title"), "strike_date": info.get("strike_date")})
        except Exception as e:  # noqa: BLE001
            errors.append(f"event {s['event_ticker']}: {e}")
        for kind in ("GAME", "SPREAD", "TOTAL"):
            et = f"{s['base']}{kind}-{s['suffix']}"
            try:
                ev["markets"].extend(markets_for(et))
            except Exception as e:  # noqa: BLE001
                errors.append(f"{et}: {e}")
        events[s["suffix"]] = ev
    doc = {"fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "version": "actions-1", "source": "Kalshi public API, read by GitHub Actions",
           "slate": [{k: v for k, v in s.items() if k != "base"} for s in slate], "events": events, "errors": errors}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(doc, f, separators=(",", ":"))
    n = sum(len(e["markets"]) for e in events.values())
    print(f"wrote {a.out}: {len(events)} events, {n} markets, slate rows {len(slate)}, errors {errors}")
    return 1 if (errors and not n) else 0


if __name__ == "__main__":
    sys.exit(main())
