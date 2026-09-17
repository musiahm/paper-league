# Paper League

The league's site. Everything is computed in the browser when the page loads:

- `index.html` — standings, games, the System's reasoning, every bet
- `game.html?e=<event>` — one game: every open Kalshi market, the slip that places bets
- `shared.js` — data layer (teams, colours, Kalshi market shapes, fees, standings, Eastern time)
- `config.json` — players, bankroll, per-game budget, the sheet's tab ids, the bet form
- `research/<event>.json` — optional hand-written homework per game (consensus line, injuries, weather, takes)
- `markets.json` on the **`data` branch** — every Kalshi market for the slate games, rewritten every 5 minutes by
  `.github/workflows/kalshi.yml` (`scripts/fetch_markets.py`, standard library only). The `data` branch is one force-pushed
  commit, so it never grows and never triggers a Pages build.
- `system_feed.json` — optional; the collector (`sports_collector`) pushes it when it runs, and the site shows the System's picks from it.

Bets: the game page posts each bet to a Google Form; its responses land in the league sheet's *Form Responses 1* tab with
Google's timestamp, and the pages read that tab as CSV on load. The sheet is the database, nobody has to open it.
