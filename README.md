# TRANSFORM — 9-Month Body Transformation Tracker

Local-first personal fitness tracker for a specific 36-week cut→build program:
daily food/workout/metric logging, weekly reviews, monthly photo check-ins, and an
agent-facing REST API + MCP server so an OpenClaw agent ("Eagle") can log entries
from natural language.

Single user. Runs on a Mac Mini, accessed from a phone via Tailscale. No cloud,
no external services.

## Stack

- **Next.js 14 (App Router, TypeScript)** — UI + API routes in one app
- **SQLite** via `better-sqlite3` — DB file at `./data/transform.db`
- **Tailwind** styling, **Recharts** charts
- Photos on disk at `./data/photos/`, metadata in DB
- **MCP server** in `/mcp` (stdio transport) wrapping the REST API

## Setup

```bash
npm install
cp .env.example .env        # set API_TOKEN + NEXT_PUBLIC_API_TOKEN (same value)
npm run seed                # 36-week calendar, 5-day split, staple foods (idempotent)
npm run dev                 # http://localhost:3000
```

Production on the Mac Mini:

```bash
npm run build
npm start                   # then reach it over Tailscale from the phone
```

Run the parser tests with `npm test`.

## Auto-start on the Mac Mini (launchd)

The MCP server needs no daemon — Eagle's MCP client spawns `node mcp/server.js`
on demand over stdio. Only the Next.js app must survive reboots. A LaunchAgent
template is included at `deploy/com.transform.app.plist`:

```bash
npm run build                                  # `npm start` serves the built app
cp deploy/com.transform.app.plist ~/Library/LaunchAgents/
# edit ~/Library/LaunchAgents/com.transform.app.plist:
#   - ProgramArguments npm path → output of `which npm`
#   - WorkingDirectory → absolute path to this repo
launchctl load ~/Library/LaunchAgents/com.transform.app.plist
```

`RunAtLoad` starts the app at login and `KeepAlive` restarts it on crash. Logs
go to `/tmp/transform.log` / `/tmp/transform.err.log`. Note a LaunchAgent runs
at **login**, not boot — enable automatic login for the Mini's user (System
Settings → Users & Groups), or install it as a LaunchDaemon in
`/Library/LaunchDaemons` instead if you need it login-independent.

## Backup

**Everything under `./data/` is the backup unit** — the SQLite DB and all photos.
It is rsync/Time Machine friendly; copy that one folder and you have everything.

```bash
rsync -a data/ backup-location/transform-data/
```

## Auth

All mutating `/api/*` routes require `Authorization: Bearer <API_TOKEN>`.
The UI itself has no login (it's Tailscale-gated) and sends the same token from
`NEXT_PUBLIC_API_TOKEN`.

## Program

36 weeks starting Monday 2026-07-13:

| Weeks | Phase | Calories | Protein |
|---|---|---|---|
| 1–20 | cut | 2,200 | 200g |
| 21–22 | transition | 2,400 | 200g |
| 23–36 | build | 2,600 | 210g |

Training is a 5-day split (Mon–Fri): Upper / Lower / Push / Pull / Legs+Abs.
Dates are local time (America/Denver), weights in lbs, measurements in inches.
Est. 1RM uses Epley: `weight × (1 + reps/30)`.

## REST API

| Route | Method | Description |
|---|---|---|
| `/api/today` | GET | Week/phase, targets, running totals, today's workout w/ last weights, 7-day avg weight, open suggestions. Also runs the rules engine. |
| `/api/log/food` | POST | `{desc}` natural language ("2 eggs, english muffin and a fairlife") or `{food_item_id, quantity}` or free text + macros. GET `?date=` for the journal; DELETE `?id=`. |
| `/api/log/workout` | POST | `{template_day?, sets:[{exercise,weight,reps}]}` or `{sets_description}` free text ("bench 185x8,185x7; pullups +25 x8/8"). GET `?limit=` for history. |
| `/api/metrics` | POST | Upsert daily metrics by date (weight, steps, sleep, cardio, med_notes, energy). |
| `/api/photos` | POST | Multipart upload: `file`, `angle` (front/side/back), `date?`, `notes?`. GET lists all. |
| `/api/photos/file/:id` | GET | Serves the image. |
| `/api/photos/compare?w1=&w2=` | GET | Photo pairs by angle for two weeks. |
| `/api/week/:n` | GET | Weekly rollup: avg weight, Δ vs prior week, adherence x/5, avg macros, cardio count. |
| `/api/progress` | GET | Weight series (daily + 7d avg), weekly volume per muscle group, est. 1RM trends on the 4 main lifts. |
| `/api/suggestions/:id` | POST | `{status: 'accepted'\|'dismissed'}`. |
| `/api/measurements` | GET/POST | Body measurements (inches). |
| `/api/program` | GET | Full 36-week calendar + current week. |
| `/api/food/search?q=` | GET | Search food items (`&staples=1` for staples only). |

## Rules engine

Runs on every `/api/today` call; suggestions dedupe per rule + program week.

- **slow_loss** (cut): 7-day avg loss < 1.0 lb/wk two weeks running → drop 150 cal or add 2,000 steps
- **fast_loss** (cut): loss > 2.0 lb/wk two weeks running → add 150 cal
- **strength_drop**: est. 1RM on a main lift down two weeks running → deload advice
- **protein_miss**: protein < 180g on 3+ of last 7 logged days → lean on Fairlife
- **photo_due**: every 4th week with no photos yet → photo check-in reminder
- **progression_ready**: top of rep range hit on all sets last session → add 5/10 lb (or a rep)

## MCP server (Eagle / Claude Desktop / OpenClaw)

Build once, then register the stdio server:

```bash
npm run mcp:build           # emits mcp/server.js
```

Tools: `log_food`, `log_workout`, `log_metrics`, `get_today`, `get_week_summary`.

Register with OpenClaw / Claude Desktop (`claude_desktop_config.json` or the
OpenClaw MCP config), pointing at the built server:

```json
{
  "mcpServers": {
    "transform-tracker": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/repo/mcp/server.js"],
      "env": {
        "TRANSFORM_API_URL": "http://localhost:3000",
        "API_TOKEN": "<same token as .env>"
      }
    }
  }
}
```

Eagle then logs from natural language, e.g. *"log 2 eggs, english muffin and a
fairlife for breakfast"* → `log_food`, or *"incline bench 185x8,185x8,185x7;
pullups +25 x8/8/7/6"* → `log_workout`. `get_today` answers "how am I doing
today / what's my workout".

## UI pages (mobile-first)

- **/** Today — phase/week banner, calorie+protein rings, today's workout with
  last weights and tap-to-log sets, staple quick-add, weight entry, suggestions
- **/food** — journal by day with meal-slot grouping, NL add, totals
- **/train** — session history, per-exercise progression, est. 1RM trends
- **/week** — weekly reviews with the block's focus note
- **/photos** — camera upload, grid by week, side-by-side compare slider
- **/program** — full 36-week calendar + measurements
