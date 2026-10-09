# Touchline 2026

An unofficial football management sim in the spirit of Championship Manager 01/02. It uses real 2026/27 squads from Europe's six big leagues (England, Spain, Germany, Italy, France and Portugal), all simulated side by side, and has a text match engine with CM-style team instructions, 1–20 attributes and CA/PA, and is styled after the CM 01/02 interface. It runs in the browser, is written in TypeScript, and has no runtime dependencies.

## Run it

```bash
npm install
npm run build        # -> dist/index.html (one self-contained file; open it in a browser)
npm run typecheck
npm test             # all the tests: engine, pyramid and fixes (node:test via tsx)
npm run balance      # simulate seasons of all six leagues headlessly and print per-league averages
npm run tactics-lab  # replay one fixture 3,000 times per team instruction and compare
```

The game saves automatically to the browser's localStorage, one career per browser. A fourteen-league world (280 clubs, about 8,000 players) is many MB of JSON, so saves are gzipped with `CompressionStream` and stored as base64 (about 1.5 MB after a season and 2.3 MB mid-season, growing by roughly 0.15 MB a season, against a 5 MB browser limit; if the browser refuses, use the save-file download). Saves from earlier versions are migrated when loaded, so careers carry on.

**Deploying.** `netlify.toml` tells Netlify to run `npm install && npm run build` and publish `dist/`, so connecting this repository to a Netlify site deploys the game on every push. `dist/` and `node_modules/` are not committed.

## The database

`src/engine/db/` holds 114 clubs and 2,888 real players (the lower divisions of every country are added on top of these, see [The pyramids](#the-pyramids)):

| File | League | Clubs | Players |
|---|---|---|---|
| `premier-league-2026.ts` | Premier League | 20 | 547 |
| `laliga-2026.ts` | La Liga | 20 | 496 |
| `bundesliga-2026.ts` | Bundesliga | 18 | 483 |
| `seriea-2026.ts` | Serie A | 20 | 483 |
| `ligue1-2026.ts` | Ligue 1 | 18 | 407 |
| `primeira-2026.ts` | Primeira Liga | 18 | 472 |

`db/index.ts` lists the leagues and `db/types.ts` documents the row format. Where a researched squad is thin or has a gap (no second keeper, no natural wide player), `fillSquad` tops it up with generated squad players. These are deliberately a level below the club's real first team, so across the six leagues only about five of them start matches.

- **Factual data:** squad numbers, positions, nationalities and dates of birth. These were compiled from Wikipedia's 2026–27 league, club season and club pages and cross-checked against reported summer 2026 transfers, as of early September 2026. Deals completed late in the window may be missing.
- **Board and the sack:** `engine/board.ts`. Confidence (0–100) moves after every match (result against expectation), monthly (league position against the board's target, and the spending rule) and at season's end. Warnings come at 35 and 25; at 12 or below after two warnings, with 8+ league games played, you are sacked and choose from five clubs of similar standing. Shown on Club Info and the toolbar.
- **Decisions block Continue** (`engine/decisions.ts`): bids for your players, club counter-offers, fee-agreed talks waiting on your terms, and injuries of six weeks or more (acknowledge with "Noted") stop the game and are listed at the top of the Inbox. The sim stops as soon as one appears. Kick-off is also blocked if your picked XI has players who can't play.
- **Tactics and pre-match:** "Unpick all players" empties the XI and bench (empty slots are stored as `-1`). Kick-off is blocked until the XI is full. After a match, Continue on the report returns to the Inbox. Free agents and the transfer list have sortable column headings (`ui/sortable.ts`).
- **Counters:** when you counter an AI club's bid and they would meet your price, you get a final "Confirm sale" dialog before the deal goes through (`counterAccepted` in `engine/transfers.ts`). The tactics player list has a sortable **Picked** column: XI from goalkeeper to attackers, then substitutes, then the rest.
- **Search** (toolbar) finds players, clubs and scouts by name, ignoring accents. **Compare** (on a player's profile) puts up to three players side by side.
- **Free agents:** 24 well-known unattached players (Sancho, Pogba, Benzema and others, from press lists after the 2026 window) start in the free-agent pool (`db/free-agents.ts`).
- **Bans and bookings** are per competition (`engine/discipline.ts`): five league yellows or three in a cup or Europe bring a one-match ban, and a red only bans you from that competition. The three UEFA competitions share a record.
- **Traits:** `engine/traits.ts` derives 15 traits (Clinical finisher, Poacher, Playmaker, Speedster, Hot-headed, Injury prone and so on) from a player's attributes, plus reputation traits for ~17 real players. Each gives the match engine a small modifier (3–12%) and shows on the player profile for players you know well (scouted players show none). No save changes.
- **Estimates:** the CA/PA ratings are Touchline's own and are not licensed data. `db/traits.ts` gives about 70 well-known players their signature strengths (Haaland's finishing, Doku's dribbling, preferred feet).
- **Stable attributes:** each player's attributes are generated from a hash of his name, so he is identical in every new game.
- **No branding:** no club crests or league branding are used. Clubs appear by name and kit colours only.

To update a squad, edit the rows. `npm test` checks the data for integrity: club counts, keepers, formations, ratings, birth dates, and no player listed at two clubs. Namesakes such as the two Vitinhas are told apart by birth month.

## Project layout

```
src/engine/             Pure simulation. No DOM, so it runs in Node for tests and balancing.
  types.ts              Data model (plain JSON, so a save is just the state)
  rng.ts                Seeded RNG. Every random decision goes through it
  db/                   Real-world database and player traits
  data.ts               Name pools for youth-intake regens, injury list
  attributes.ts         Attribute lists, role weights, CA calculation, generation, development
  generate.ts           New world from the database; regens; AI club styles
  fixtures.ts           Double round-robin (balanced home/away), weekends, kick-off slots per league
  kickoffs.ts           TV picks: confirms kick-off times about five weeks ahead
  roundup.ts            Match reports, upset/big-game tags, matchday round-ups
  migrate.ts            Brings older saves up to date
  tactics.ts            8 formations, the assistant's team selection, bench
  match.ts              Minute-by-minute match engine (TUNING constants at the top)
  commentary.ts         Commentary text templates
  league.ts             Competitions and league tables (with points deductions)
  finance.ts            Values, wages, contracts, club revenue and costs, monthly accounts, spending rules
  scouting.ts           Knowledge and fog of war, scouts, assignments, reports
  calendar.ts           Real 2026/27 dates, carried to later seasons on the same weekday
  cups.ts               Domestic cups and UEFA competitions: draws, brackets, league phase, prize money, clashes
  levels.ts             Pure data: every country's divisions, promotion/relegation/play-off rules, pool names
  pyramid.ts            The pyramids: real EFL squads, generated squads elsewhere, play-offs, promotion and relegation, the non-league pools
  ext.ts                Clubs from outside the six leagues (lower divisions, rest of Europe) and their squads
  intl.ts               International windows, call-ups, national-team results, Asian Cup, qualifying groups
  db/intl-2026.ts       Real 2026/27 international fixtures, groups and Elo ratings
  db/efl-2026.ts        Real squads of the 72 EFL clubs (names, positions, nationality; ages, roles and ratings are estimates)
  db/second-tiers-2026.ts Real squads of the 94 clubs in the Segunda, 2. Bundesliga, Serie B, Ligue 2 and Liga Portugal 2
  db/cups-2026.ts       Real league dates, cup draws and pairings, lower-division and European clubs
  transfers.ts          Windows, bids, personal terms, release clauses, loans, renewals, expiries, the AI market
  game.ts               Calendar days, results, discipline, morale, monthly development, news, summer
  scenario.ts           Flying Ants mode: the liquidation, the new club, its ten scouted players, the two stories
src/ui/                 Vanilla TS + HTML strings; clicks delegated via data-act, selects via data-change
  app.ts                Shell (CM-style toolbar and club-coloured menu bar), save/load, mode chooser and new game
  article.ts            One news story: tag, headline, paragraphs and a list of the players it is about
  screens.ts            Inbox, squad, player, tactics, fixtures, table, stats, club, report, season review
  live.ts               Live match: queued commentary, half-time, mentality, instructions, substitutions
  scoutui.ts            Scouting screen, attribute ranges, estimated ability, reports on player pages
  intlui.ts             Internationals screen: your internationals, fixtures and results, competition tables
  cupui.ts              Cups screen (brackets, league-phase tables), cup chips, legs and aggregates
  market.ts             Transfers screen, player contract and offer panel, squad contracts, finances screen
  dnd.ts                Pointer-based drag and drop for team selection (mouse and touch)
  styles.css            CM 01/02-inspired skin
tests/engine.test.ts    61 engine tests
tests/pyramid.test.ts   Pyramid tests: structure, full promotion/relegation seasons in every country, League Two drop-outs, upgrading old saves
tools/pyramid-seasons.ts Plays seasons of the whole pyramid and prints balance (goals, points, moves, play-offs)
tools/balance.ts        Multi-season balance report
tools/tactics-lab.ts    Effect size of each team instruction
tools/runs-lab.ts       Effect size of the run arrows
tools/ants-lab.ts       Prints the Flying Ants squad, traits, stories and money
tools/ants-seasons.ts   Plays Flying Ants seasons with the computer in charge and reports where they finish
build.mjs               esbuild bundle + CSS inlined into one HTML file
```

## League tables

The League Table screen shows your own league. Under it, an **Around the world** section has a Country row and a League row for every other league, so you can follow the rest of the pyramid and the other countries without leaving the screen. (Fixtures and Statistics still have their own league tabs.)

## Landscape on phones

Turn a phone sideways and the game switches to a layout made for a short, wide screen (`ui/layout.ts`: landscape, at most 520px tall, touch screen). Portrait phones, tablets and PCs keep the normal layout, and turning the phone switches straight away.

- **Menu strip** down the left edge: Inbox, Squad, Tactics, Fixtures, Table, Transfers and **More** (every other screen, Back, the date, board confidence and search), with **Continue** fixed at the foot. The page itself never scrolls; each panel scrolls on its own, and keeps its place when the screen redraws.
- **Live match:** the scoreboard stays at the top, the commentary and key moments on the left, and on the right four tabs: **Your team** (mentality, instructions, ratings, substitutions), **Stats**, the **opposition**, and the other **Scores**. The match controls run along the bottom. The half-time card and incidents appear in the left column; **Tactics** puts the pitch on its side with the bench, instructions and the opposition beside it.
- **Tactics:** the pitch lies on its side, attacking left to right, with the formation and mentality beside it and three tabs: **Squad** (drag a player onto a shirt, or tap a shirt to open the swap list on the right), **Bench**, and **Shape** (team instructions, runs, the key).
- **Player profile:** his club's squad is listed beside the profile, so you can flick from player to player. The inbox shows the message list beside the message.
- **Very short screens** (browser bars showing) drop the date from the strip and use smaller shirts, so Continue always fits.
- **Home screen:** on the Netlify site, *Add to Home Screen* (iPhone, Safari share menu) or *Install app* (Android, Chrome) opens the game full screen without the browser's bars, with its own icon (`public/`: manifest, icons; copied into `dist/` by the build). Either way up still works.

## Tactics on phones

On screens up to 980px wide the run arrows leave the pitch: a shirt with runs switched on shows a small badge, and tapping any shirt (or substitute) opens a sheet along the bottom with the two run toggles and the whole squad ordered by rating in that position (green natural, amber accomplished, red out of position). One tap swaps a player in, and the sheet stays open for further changes until you press Done. The squad list sits straight under the pitch and bench, and team instructions come last. Wider screens keep the arrows above the shirts and drag and drop.

## Pre-season and training

A game starts on **15 June**, with the summer transfer window already open (it opens on 15 June and closes on 1 September) and the squad on holiday. Every new season starts the same way. The calendar stops on **1 July**, when the players report back: you choose a **training camp** (`engine/training.ts`) before Continue works again. Four **friendlies** (`comp: 'FRI'`, Saturdays before your first competitive match) follow against clubs of about your level. Friendlies build sharpness and test your shape but leave no trace: no stats, cards, bans, gate money, morale or board reaction.

- **Camps:** train at the club (free); a warm-weather camp (better fitness and tactical work); an altitude camp (the best fitness, more injury risk); or a commercial tour (big clubs earn far more than the trip costs; less training). The camp runs 12–24 July and is paid for when you book it.
- **Match sharpness** (`Player.sharp`, 0–100; missing = 88) starts around 55 after the break and climbs with training, and more with games. It scales a player's strength (85–100%), his fatigue and his injury risk in matches, and falls during a long injury. Other clubs train at a standard level, so they come out of pre-season at about 85–90%.
- **Weekly programme:** a workload (light, normal, heavy: heavy builds sharpness fastest but drains condition and injures more) and a team focus (balanced, fitness, tactics, or a drill).
- **Tactical familiarity** (0–100 per formation): a side plays best in a shape it knows (75 is neutral, worth about ±3%). Playing and training in a formation raise it; unused formations start at 60 and fade; new signings cost a little.
- **Drills** (passing style, closing down, counter attack, offside trap, hard tackling: 50 is a normal side) improve how well an instruction works when your tactics use it (about ±6%). The focus drill climbs; the others fade back to 50.
- **Individual programmes** (up to six players): work on one attribute (about one point a year for a good learner, more for the young, almost none for physical attributes in players over 30), or **learn a new position**. Retraining moves the player's familiarity with that position from where he starts (near positions such as left back to right back start higher) up to natural, at about 0.5–1.1 points a month: roughly one to two seasons. Keepers can't be retrained.
- **Fixtures screen:** every match row carries a competition chip: the league's name (Premier League, La Liga and so on), the cup or European competition with its round, or *Friendly*.
- **Screens:** a **Training** tab (team programme, camp, sharpness, familiarity, drills, friendlies; then individual programmes and positions), a Sharp column on the squad and tactics lists, and a warning before a competitive match if three or more of your XI are below 65%.

## Run arrows

On the tactics board (and the pause screen mid-match) each outfield shirt has two arrows above it. A **solid arrow** means he runs with the ball; a **dashed arrow** means he makes forward runs without it. Both can be on. Arrows belong to the player, not the slot, so they follow him if you move him, and disappear if he leaves. The AI clubs don't use them.

- **With the ball:** part of his defending becomes attacking (`RUN_SHIFT`, scaled by how good a dribbler he is: dribbling, pace, technique; a poor one loses the ball and gives up some midfield work), he creates more chances for others in through balls, cut-backs, counters and crosses, and takes a few more long shots and box chances. It costs about 12% more stamina.
- **Without the ball:** the same shift, scaled by off the ball, pace and anticipation, and he is more likely to be the man on the end of through balls, counters, cross and box chances. It costs about 15% more stamina, and the side is caught offside a little more often (about two points more per runner on a through ball).
- **The price:** defenders and holding midfielders who go forward leave gaps. Each adds to the share of the opposition's chances that are counter-attacks (centre-backs count double).
- Arrows are a style tool rather than a free lunch: in `tools/runs-lab.ts` no arrangement changes goal difference much. Everyone forward roughly doubles the goals at both ends, and centre-backs carrying the ball concede more than they create.
- Changes made during a match last for that match. The arrows set on the tactics screen are your defaults.

## VAR and offside

VAR is used in every competitive match (not in pre-season friendlies). It shows in the commentary as blue italic lines.

- **Goals:** about one in ten is checked for offside, a foul or handball in the build-up. About a quarter of those are ruled out (2–3% of goals). A ruled-out goal never reaches the score, ratings or the scorer's tally, but the shot still counts. The semi-automated offside system quotes the margin in centimetres.
- **Penalties:** a few are overturned after a review (no contact, or outside the box), some are only given after the referee goes to the monitor, and some are simply confirmed.
- **Red cards:** about one straight red in eight is downgraded to a yellow (if the player wasn't already booked); some are confirmed on review; very rarely a yellow is upgraded to a red.
- **Offside flags** in open play also quote the semi-automated system's margin.

## Injuries and surgery

Long injuries (a torn or ruptured ligament, a broken leg, a ruptured Achilles, a fractured metatarsal) stop the game with a **Waiting for your answer** message, as before. Now you decide how he's treated, in that message or from his profile (`engine/surgery.ts`):

- **Rehabilitation only:** free; he takes the injury's natural time. The worst injuries carry a 12–20% chance of a complication.
- **Operation at the club surgeon:** about £100k for a twelve-week injury (cheaper in the poorer leagues); back in 14–28% less time; half the complication risk.
- **Operation by a top specialist:** 3.5 times the price; back in 24–40% less time; a fifth of the risk.
- A **complication** adds about a third to the time out, and for breaks and ruptured tendons there's a 30% chance it costs him a point of pace for good. Players over 31 carry a slightly higher risk.
- The choice is made once and the outcome is known immediately (it's seeded from the game and the day, so reloading doesn't re-roll it). The bill is charged at once; a club that can't afford it can still choose rehab. **Decide later** leaves the choice open on his profile while the injury is at least four weeks from over.
- Three longer injuries (fractured metatarsal, Achilles, cruciate rupture) join the list, at low frequency.

## Save files

The career is saved in the browser after every change (gzipped, in localStorage). To keep a backup, move to another device or share a career, use the **Save file** panel on **Club Info** (or on the start screen before a game):

- **Export save file** downloads `touchline-<club>-<season>-<date>.json`: a small header (club, manager, season, when exported) around the gzipped game, a few hundred kilobytes. In the published page the download goes through the host's save prompt; in a plain browser it is an ordinary download.
- **Load save file…** reads that file (or the bare `gz:` text, or a plain game JSON). Older versions are upgraded on the way in, the same as the browser copy. A file that isn't a save, is damaged, is too old to upgrade or comes from a newer version is refused with a reason. Loading over a running career asks first and names both careers; nothing changes until you confirm.
- **Copy or paste instead** covers browsers that block files: copy the save text out, or paste it in to load. It is the same format.
- Loading is disabled during a live match (the Club Info page isn't reachable then). Files are checked and upgraded by `ui/saveio.ts` (`parseSaveFile`), which the tests cover.

## Game modes and Flying Ants

The first screen asks for a mode. **Classic Mode** is the game as before: the real world, September 2026. **Flying Ants Mode** is a fictional what-if that rewrites the Premier League before day one (`engine/scenario.ts`, chosen through `newGame(seed, name, 'flying-ants')`; `state.mode` and `state.scenario` are saved, and older saves are simply classic):

- **The story.** The new-game screen opens with a front-page article: Manchester City have been found guilty of financial irregularities and liquidated. It is also the first message in the inbox.
- **The money and the players.** City's cash is shared equally between the other 19 Premier League clubs (added to their balances and budgets), and all of City's players become free agents. Because the best free agents ever are on the market, the other clubs go after them from day one, within their wage budgets (`freeAgentScramble` in `transfers.ts`). In test seasons most of the best are signed within three months, and the very biggest earners (Haaland) can stay unsigned because no club can afford the wages.
- **Flying Ants.** A new club takes City's place, id and fixtures in the league, and City's cup and European places (`state.scenario.replaced` maps the old name to the new one for the cup builder). Black and gold, reputation 3.5, a small bank balance, no financial history, a wage budget 30% above the wage bill (room for a few of the released stars) and a 4-2-3-1 that suits the ten, and a squad of 24: the ten scouted players below plus generated cover. With the computer in charge they average about 18th (14th to 20th over six test seasons, around 32 points), so it is a survival job that a good manager can turn round.
- **The ten** (English, apart from Evans, all on three-year deals, none injury-prone or hot-headed): Stuart Lee (box-to-box midfielder, tireless), Jack Selby (centre-back, aerial), Jamie Saunders (target-man striker, aerial), Jamie Evans (Welsh left-back, delivers crosses), Chris Light (goalkeeper, shot-stopper), Simon Manson (utility man, natural in the middle but competent at back, wide and in defensive midfield), Adam Green (right-back, speedster), Patch Thompson (young midfielder, shoots from distance), Kealan Sheridan (the number 10, playmaker) and James Roworth (natural goalkeeper *and* striker). Their traits come from the attributes they are given in `FLYING_ANTS_TEN`, so they develop with the player.
- **The second story.** When the manager takes the Flying Ants job (only the first time), a second story tops the inbox: the club has taken over the New Den after Millwall were wound up (a made-up reason: their owners could not refinance the loans secured on the stadium), renamed it The Dirtbox (20,146), and revealed the ten newly scouted players, listed under the story with position, age, traits and a line each, linking to their profiles. Millwall also drop out of the cup draws.
- **Classic is untouched.** The scenario runs after the world is built, on its own random stream, so every other club and player is identical to the classic world with the same seed.

## Calendar

Season days are counted from 1 August (the pre-season runs on negative days from 15 June). The season runs by date on each league's real 2026/27 calendar: the Primeira Liga starts on 8 August and the Bundesliga on 29 August, with the real midweek rounds (the Premier League's Boxing Day and new-year run, for example) and winter breaks. Later seasons keep the same pattern, moved to the same day of the week. Continue plays through any day your club is idle (the other leagues carry on without you), then stops before your next match, but never moves on more than **seven days** at a time: in a long gap (an international or winter break) it stops at the inbox each week and tells you how far away your next match is. On a keyboard, the **space bar** presses Continue (except while you're typing in a box or a dialog is open). The League Table, Fixtures and Statistics screens have a tab for each league.

**Home and away** alternate. The schedule uses the canonical round-robin pattern, so no club has more than two home or two away games in a row, and nobody meets the same opponent on consecutive matchdays.

**Kick-off times.** Each league has its traditional slot (Saturday 3pm in England, Saturday 15:30 in Germany, Sunday 3pm in Italy and France, and so on) and a set of TV slots from Friday night to Monday night. The opening weeks are confirmed with the fixture list. After that, the broadcasters pick about five weeks ahead: the most attractive games (big clubs, and clubs near the top once the table takes shape) move to the prime slots, and nobody plays twice within three days. If your game is moved you get a message, and moved games carry a **TV** badge. Unconfirmed kick-offs show as TBC.

## Matchday flow

Continue always stops at a **pre-match screen** before kick-off. It shows the opposition's shape, their form, players to watch and absentees. It also warns you about injured, suspended or tired players in your XI, and the full tactics board is there to make changes. If your assistant picked the side, kicking off asks you to confirm first.

On the tactics board you can drag a player from the squad list onto a shirt, drag one shirt onto another to swap them, or drag a shirt onto a list player to bring him in. Clicking a shirt and then a player still works too.

**Match day.** Before the pre-match screen the calendar moves on to the day of the match itself, so players back from international duty and players whose injuries have healed are available to pick. No league match or cup tie is ever moved into an international window, and if a club still can't raise eleven, national teams release players to make up the numbers.

**Substitutes.** Up to nine substitutes can be named (the 2026/27 rule in the big leagues). Use **+S / −S** in the squad list, drag players onto the bench, or drag a substitute onto a shirt to swap him into the XI. Otherwise the assistant names a keeper, cover for each line and the best of the rest. The pre-match screen warns if there's no keeper on the bench or a named sub has become unavailable.

## During a match

- **Substitutions:** five per match, made in no more than three stoppages. Changes at half time don't use a stoppage. A substitution stops the game and waits for the restart: the board shows the side as it will be, each waiting change has an **Undo** (or **Undo all**), and nothing is confirmed or announced until you press **Restart play**.
- **Condition:** every shirt on the pitch and bench has a condition bar (green fresh, amber tiring, red tired), the squad list shows condition next to the name, and the substitution lists give each player's figure.
- **Tactics:** press **Tactics** to pause and open the board. Drag a substitute onto a shirt to bring him on, or drag one shirt onto another to swap positions. You can also change the formation, mentality and every team instruction.
- **National team pages:** click a player's nationality (or any nation in the internationals tables and fixtures) to open the national team: rating, this season's record, next game, the squad, and its fixtures, results and group tables.
- **National squads:** Internationals → Squads shows any nation's latest squad (or its likely picks before one is named), with club, caps and who's away now.
- **The opposition:** the Teams panel has a tab for the other side, showing their shape, mentality, instructions, ratings, condition, cards and bench. The Tactics view also shows their formation on a small pitch.
- **Skip to half time** runs the first half instantly but stops early for an incident. **Skip to full time** hands the side to your assistant for the rest of the game.
- **Injuries and red cards** to your players pause the game. The player is highlighted and the assistant suggests a change: a like-for-like replacement for an injury, or, after a red card in defence or midfield, taking off a forward to fill the gap. You can make that change with one click, open Tactics or carry on. Your assistant doesn't make changes for you unless you skip to full time. A sent-off keeper is replaced straight away.
- **Half time:** your assistant (a named member of staff, the same at each club) gives you a card: a verdict (*On top*, *Under pressure*, *Toothless*…), up to three things he has seen with the numbers behind them (shots, where their chances come from, their key man, battles in the air, bookings and tired legs), how the other side is set up, and up to three changes with a one-tap **Apply** (mentality, team instructions, a player's runs). He only suggests **substitutions when things are going badly** (behind, or clearly second best). Subs he suggests wait for the restart like any other. **Thanks, leave it** closes the card (`engine/analysis.ts`, `ui/assistantui.ts`).
- **Latest scores** shows the other games in your league that kick off at the same time, plus any finished earlier that day.

## After a match

The match report opens with a written summary: how the game went (a comeback, a late winner, a two-goal lead thrown away), the scorers (with braces and hat-tricks), red cards, missed penalties and injuries, the numbers (including wins against the run of play), the man of the match, and where both clubs now sit in the table. Below it, **Around the league** lists the rest of the matchday with kick-off times. Games still to be played show as fixtures, and results are tagged **Upset**, **Big game**, **Thrashing** or **Goal-fest**. When the whole matchday is over, the inbox gets a round-up with the upsets, big games, biggest win, goals scored and the title race.

**The assistant's debrief** arrives in the inbox after every competitive match, on top of the result: a verdict (*Deserved*, *Smash and grab*, *Unlucky*…), the story of the game (by halves, where our chances came from, their main threat), what worked and what didn't, shots by 15-minute spell for both sides, the changes made during the match (and whether they made a difference), player notes (rating, key passes, shots, tackles for the best four and the worst) and a look at the next game: the opponent's position, form and set-up, and who needs a rest if it comes soon. It is worked out from the numbers the engine keeps for your matches, so it never changes a result.

**Names in the news are links.** In every inbox story (and the assistant's debrief), club names open the club's page and players open their profile. A full name is always linked; a surname on its own only when it can mean one player (one of that name among the clubs the story mentions and your own club).

Every club name is a link to that club's page: its information, how it plays, its full squad (players open their profiles) and its fixtures.

## Transfers and contracts

**Windows.** The summer window runs to 1 September and the winter window from 1 January to 2 February. Deals agreed while the window is shut go through the day it opens. Free agents can be signed at any time. The toolbar shows when the window is open.

**Buying.** Find players on the Transfers screen (search by name, position, league, maximum value and age; the transfer list; free agents), then make an offer from the player's profile. The selling club answers straight away. It accepts, names its price, or turns you down. Clubs ask more for regulars and much more for their key men, and less for listed players and those near the end of their contracts. Three rejected bids end the talks. A bid that meets a **release clause** can't be refused. Every player in Spain has one, as do most in Portugal and a few elsewhere. Once the fee is agreed, you offer **personal terms** (weekly wage and contract length). The player accepts, says what he wants, or walks away after three rounds. His yes isn't the signature: the panel shows the agreed wage, length, release clause and fee, and he only signs (and the fee is only paid) when you press **Sign him** and confirm. Until then you can change the terms or walk away, and another club can still sign him. A fee deal confirmed while the window is shut goes through the day it opens; free agents sign straight away. **Loans** work the same way: when the club agrees, a **Loan agreed** panel shows the length, your share of his wage, any option to buy and any January recall clause, and he only joins when you press **Confirm loan** (accepting a club's counter-offer counts as your confirmation). Players won't drop far below their current club's level unless they're older or not playing.

**Limits.** A bid can't exceed your transfer budget, a signing's wages must fit your wage budget, and squads are capped at 32. In Spain, La Liga won't register a signing that would push squad costs over 70% of revenue.

**Loans.** Ask to borrow a player until the end of the season, choosing what share of his wages you pay and, optionally, a fee to buy him. Clubs won't loan out first-team players, and bigger clubs want you to pay more of the wage. Loans end in the summer. You can take up an option to buy before then, and AI clubs with an option keep the players they rely on. An option to buy is a permanent move in waiting, so a player who wouldn't join a club of your stature permanently may still come on loan, but only without an option, and won't sign permanently at the end of it. The Transfer list tab marks each player **Sale** or **Loan**, with filters for each.

**Budgets.** The transfer, wage and scouting budgets all come out of the bank balance. The board raise the wage budget during the season as the balance grows (sales, prize money): a tenth of the cash in the bank per year on top of the revenue-based budget, never above what PSR (Premier League) or the 70% squad cost rule (elsewhere) allows, and never below what they set in the summer. On the Finances screen you can move money from transfers to wages (a year of the weekly sum: £10k a week costs £520k) or back (not below the wages you already pay), and between transfers and scouting; the Scouting screen has the same scouting top-up.

**Links everywhere.** Competition names and chips (fixture lists, the next-match card, pre-match and report headers, club pages, the season review) open the league table or the cup's page; international competitions open their tables. Club names on scoreboards, award lists and round-ups open the club, and players named as unavailable open the player.

**What you know about players.** The elite are household names: the very best are known almost inside out. Knowledge also comes attribute by attribute (the better known, the more attributes exact). Playing against someone teaches a lot (a full match more than a cameo), and anyone who has been at your club, on loan included, stays fully known after he leaves.

**No byes in the cups.** Before a cup is drawn the entry numbers are balanced so every round halves exactly: the weakest clubs due to join a round start one earlier, or the strongest join one later. When fixtures clash, cup ties move first, then league games, with two days' rest (or, at worst, consecutive days) as the last resort.

**Your stadium.** Club Info → Stadium shows the ground, its average crowd and sell-outs, and how many supporters want tickets (the fan base, lifted this season by a high league position or Europe; a good season grows it, a bad one shrinks it). Put plans to the board: rebuild one or two stands (+15% or +30%, about 10 months, with some seats closed meanwhile) or build a new ground of 30,000 to 80,000 (three seasons, opening in the summer; name it yourself or sell the naming rights for commercial income). The board decide on their confidence in you (55+ for a stand, 65+ for a new ground), whether the club could fill it, and whether it can afford it: cash they can spare first, the rest on a loan at 5% (8 years for a stand, 25 for a new ground), with repayments no more than a fifth of revenue. Stadium costs come out of the bank balance but, as infrastructure, don't count towards PSR or the squad cost rules. Once a ground is bigger than its fan base, crowds follow demand rather than selling out.

**Club transfer history.** Every club's page (your own under Club Info) has a Transfers tab: who came in and went out each season, with fees, loans, frees and releases, and the season's spend and income. Other clubs' moves are kept for five seasons, yours for good.

**Wage demands.** A player asks for a rise on what he earns, or the going rate for his ability at your club, whichever is more. A player stepping up from a much lower wage (a lower-division breakout, say) hasn't the standing for the going rate yet: he asks up to four times his current wage, or about a third of the going rate if that's more. Free agents and your own players renewing know their worth.

**New contracts mid-deal.** You can offer one of your players a new contract at any time, not just near the end of his deal: to give him a pay rise, or to change or remove his release clause. He won't sign for less time than he has left, and because he doesn't need a new deal he almost always wants a rise on what he earns (about 12% with two or more years left, 8% with one), on top of what the clause choice costs (no clause about 12% more). Only a player paid far above his worth will sign again for the same money. After a refusal the form keeps his asking wage and your choices for the next try.

**Recall clauses.** A loan agreed in the summer window can include a clause letting the parent club recall the player in the January window. When a club asks to borrow one of your players, accept with a recall clause and they decide: young squad players they usually allow, a player they'd build their side around less often; if they refuse, accept without it or turn them down. AI clubs add the clause to many of their own summer loans (including players they loan to you), and in January they use it, mostly for players who have hardly played. You recall a player from his page during the January window; the inbox reminds you when the window opens.

**Release clauses.** Any club that bids a player's release clause can talk to him, and you can't refuse. Your players' clauses show as an RC chip in the squad list and on their pages, and the inbox lists them when you take over. They follow each country's practice: **Spain** has one in every contract, by law; most contracts in **Portugal** have one; in **England, Germany, Italy and France** they're the exception (a few per cent of top-flight players). When you sign a player or offer a new contract you choose the clause (none, or 5x, 3x, 2x or 1.5x his value, or the fee if that's more), and the form starts on what's usual for your league: none in England. Where clauses are rare, no clause costs nothing extra and a player given a way out takes a little less; in Portugal no clause costs about 12% more; in Spain a high clause costs a little more. Removing a clause a player already has always costs more. A player who changes clubs gets the clause usual at his new club (his old one doesn't follow him). Clubs only trigger a clause when it's a bargain (no more than about 1.6 times his value), only bigger clubs do it, and nobody bids for a player in his first three months at your club (or triggers his clause in his first six) unless you've listed him.

**Selling.** Put players on the transfer or loan list and bids arrive while the window is open. Accept, reject, or ask for more: the bidder has a hidden limit and walks away if you go past it. Now and then clubs bid for your best players unasked, and release clauses can be triggered. 80% of every sale is added back to your transfer budget.

**Contracts.** Each player has a weekly wage and a contract to June of a given year. Renew from the player's profile: he names his price, and deals shorter or longer than he'd like cost a little more. Contracts running out are flagged at the start of the season and when the January window opens. From February, players in their final months may sign pre-contracts elsewhere. Anyone not renewed leaves on a free in the summer. Releasing a player costs half his remaining wages. The Squad screen's **Contracts & wages** view lists value, wage, contract end and release clause for everyone.

**The AI market.** AI clubs buy to fill their weakest positions. They look for players at or above their level, don't sell players they've just bought, rarely sell key men (and then only to bigger clubs), and don't strengthen their direct domestic rivals. They also list surplus players, loan out young players to smaller clubs, renew most contracts they value, and sign free agents when short of numbers. There's a burst of business each summer. A season sees roughly 100–130 permanent moves and 30–50 loans between the six leagues. The Latest transfers tab lists them all, with the biggest spenders.

## Finances

All money is in pounds, with the other leagues' figures converted at about €1 = £0.85. Everything is Touchline's own estimate. The 20 biggest earners' revenues are anchored to Deloitte's Football Money League 2026, less an allowance for European prize money (that arrives with the cups).

- **Income:** gate receipts (attendance × ticket price for every home game), TV money (monthly instalments from August to May, plus merit money by final position), sponsorship and merchandise (monthly), loan fees and player sales.
- **Costs:** wages (monthly, with loaned players' wages split between the clubs), running costs (staff, facilities, travel, the academy), transfer fees and contract pay-offs.
- **Accounting:** transfer fees are amortised over the player's contract, as in real club accounts, so a sale books a profit or loss against his remaining book value. The Finances screen shows cash flow and profit and loss side by side, this season against last.
- **Wages** follow ability, age, position and league, and each club's pay scale is set so its wage bill is a realistic share of revenue (smaller for the biggest clubs). Saka earns about £350k a week and Arsenal's bill is about £230m a year.
- **Budgets:** each summer the board sets a transfer budget from the cash in the bank, revenue and recent results, and a wage budget a little above the current bill.
- **Spending rules:** in England, **PSR** caps losses at £105m over three seasons; a club over the limit starts the next season with a 6–10 point deduction (shown in the table). La Liga's **squad cost limit** blocks registrations over 70% of revenue. Elsewhere, UEFA's **squad cost ratio** (70%) is shown as a warning, and the board trims budgets for clubs over it.

Over a simulated season, roughly half the clubs in each league lose money, and the rest make modest profits, mostly from player sales.

## The pyramids

Every country has two played tiers, and below them a **pool** of unplayed clubs. England plays four tiers.

| Country | Tiers | Down from the top | Up from the second tier | Pool below |
|---|---|---|---|---|
| England | Premier League, Championship, League One, League Two | 3 | 2 + play-off winner | National League |
| Spain | La Liga, Segunda División | 3 | 2 + play-off winner (3rd-6th) | Primera Federación |
| Germany | Bundesliga, 2. Bundesliga | 2 | 2 | 3. Liga |
| Italy | Serie A, Serie B | 3 | 2 + play-off winner (3rd-6th) | Serie C |
| France | Ligue 1, Ligue 2 | 2 | 2 | National |
| Portugal | Primeira Liga, Liga Portugal 2 | 2 | 2 | Liga 3 |

The second tiers have their own TV money, wage scale and squad strength (`LEVEL_BOOST` in `pyramid.ts`), and parachute payments for relegated top-flight clubs scale with the size of the league. The German, French and Portuguese play-offs are left out (a simplification). The bottom played division of each country sends its relegated clubs into the pool and takes the same number of pool clubs back; if you are the manager of a club that drops out of the last played division, the board release you and you can take one of five other jobs. Older saves get the new countries' pyramids at the next season rollover.

### The English pyramid

The Premier League, Championship, League One and League Two are all played in full. Every one of the 72 EFL clubs has its **real squad** (about 2,000 players, from each club's Wikipedia squad list in summer and autumn 2026, in `db/efl-2026.ts`), topped up with generated players where a list is thin, and each division has its own TV money, wage scale and ticket prices. You can manage any of them from the new-game screen.

- **Promotion and relegation:** at the end of the season 3 go up and 3 come down between the Premier League and the Championship, and between the Championship and League One (two automatic places, plus a play-off winner). Between League One and League Two, 4 go down and 3 go up (two automatic places and a play-off winner). This applies to you too: a relegated manager stays with his club and the board reset their target.
- **Play-offs:** places 3-6 in the Championship, League One and League Two play two-legged semi-finals and a Wembley final. They are drawn by the game on the real dates and shown with the cups.
- **League Two relegation:** the bottom two leave the Football League for the National League, which the game doesn't play. Their place is taken by a National League club, which arrives with a new squad; the old club drops into a pool of 24 non-league sides. If you're the manager of a club that goes down that way, the board release you and you can take one of five other jobs.
- **Parachute payments:** clubs coming down from the Premier League get three years of extra TV money (£45m, £36m, £18m) so they can keep a competitive squad.
- **Balance:** the EFL divisions score about 2.5 goals a game and play 46 matches without VAR. Promoted clubs are given a small boost, and in a six-season test about half of the Premier League newcomers went straight back down (real life is nearer 40%). `npx tsx tools/pyramid-seasons.ts 6` plays six seasons and prints the tables, moves and how promoted clubs fared.
- **Old saves:** a career saved before the lower leagues gets them at the next season rollover, with last season's lower tables decided on team strength.

## Cups and Europe

Every club plays in its country's cups, and the best in Europe. 2026/27 uses the real draws and pairings; later seasons draw their own from the final tables.

- **Champions League, Europa League, Conference League:** the real 2024+ format. A 36-club league phase (eight games each, six in the Conference League) with the **real 2026/27 draws**, played on the real matchdays (UEFA hasn't published which game is on which matchday, so the game assigns them so every club plays once per matchday). 1st to 8th go into the round of 16, 9th to 24th into two-legged knockout play-offs (the seeded side at home in the second leg). Then two-legged ties to a one-off final: Madrid (5 June 2027), Frankfurt (26 May), Istanbul (2 June). UEFA prize money is paid for taking part, for every league-phase win and draw, and for each round reached.
- **Domestic cups:** FA Cup (Premier League and Championship clubs enter the third round with 20 lower-division clubs, no replays), EFL Cup (all 72 EFL clubs start in the first round, then the real split of entry rounds for clubs in and out of Europe, two-legged semi-finals), Copa del Rey (lower club at home until the quarter-finals, the Supercopa four join in the round of 32), DFB-Pokal (the **real first-round draw**), Coppa Italia (the **real fixed bracket**, seeds at home), Coupe de France, Taça de Portugal (neutral one-off semi-finals) and Taça da Liga (the real quarter-finals, then a final four in Leiria). Each has its real round dates, hosting rule, extra-time rule and neutral final venue.
- **Lower-division and foreign clubs** are real names (Championship to National League, Segunda to Primera Federación, 2. Bundesliga to the amateur leagues, Serie B/C, Ligue 2 to National 2, Liga Portugal 2/3, and 66 clubs from the rest of Europe). The EFL clubs and every second-tier club in the other five countries have their real squads; the rest (the non-league and third-tier pools, and the rest of Europe) are generated to their level when they first play, with names from their own country.
- **Extra time and penalties:** level knockout games go to 30 minutes of extra time (with a sixth substitute and a fourth stoppage) and then a shoot-out, five kicks each then sudden death, taken in order of penalty-taking ability. Cups that go straight to penalties (EFL Cup, Coppa Italia and Coupe de France before their finals) do. Second legs are played on the aggregate score. In a live match the game stops before extra time, at its half time and before penalties, so you can make changes; the shoot-out is shown kick by kick.
- **Fixture clashes:** league games move when a club has a cup tie close by (to the Sunday or Monday, or a free midweek), and domestic cup ties move out of the way of European nights, so nobody plays twice in two days. You're told when your own game moves.
- **Rotation:** AI clubs rest their stars for early domestic ties against much weaker sides, so giant-killings happen (about a quarter of FA Cup third-round ties between different divisions go to the lower side).
- **Next season's European places** come from the tables and the cups: Champions League for the top four in England, Spain, Germany and Italy (three in France, two in Portugal) plus the Champions League and Europa League winners; Europa League for the next place and each country's main cup winner (a lower-division winner goes too); Conference League for the places after that. The rest of each competition comes from the strongest clubs around Europe.
- **Screens:** a **Cups** screen with every competition (league-phase table and matchdays, knockout brackets with legs, aggregates and penalties, rounds still to come), cup chips on the fixture list, a pre-match note on the stage and the rules (first-leg score, extra time or penalties), aggregate and shoot-out on the live scoreboard and the match report, a season-start message with your cup draws, a cup winners table at the end of the season, and a club's cup runs and trophies on its Club Info page. League statistics and awards count league games only; the player page shows all competitions.

## Internationals

National teams play in the four FIFA windows: 21 September – 6 October 2026 (a combined double window, up to four games), 9–17 November, 22–30 March and 7–15 June. No league games are played in a window.

- **Real 2026/27 fixtures:** every UEFA Nations League league-phase game for all 54 teams (with the real groups and dates), AFCON 2027 qualifying, the CONCACAF Nations League, the FIFA ASEAN Cup, the Arabian Gulf Cup, the Kirin Cup and every announced friendly. Where fixtures aren't published yet, the game makes them in the same way the real draws will: the CONCACAF quarter-finals from the group tables after October, the Nations League quarter-finals and promotion play-offs from the league phase, the **Euro 2028 qualifying draw** on 6 December (six groups of five that start in March, six of four for the teams busy with the Nations League), and friendlies for anyone without a game.
- **The AFC Asian Cup** (Saudi Arabia, 7 January – 5 February 2027) is played in full, with the real groups: Japanese, Korean, Australian, Uzbek and other Asian players leave their clubs on 1 January and miss club games until their country is knocked out.
- **Call-ups:** six days before each window, every nation with a game names up to 26 players from its best players in the game (the level it picks from depends on its strength). You're told who's going. They leave for the whole window, can't be picked by their clubs (shown as **INT** in the squad), and come back **tired**, more so after long trips outside Europe, and sometimes **injured** (you hear straight away). Goals, wins and defeats change their morale.
- **Results** come from each nation's World Football Elo rating (national sides are mostly made of players from outside the six leagues), and ratings move with results. Your players' goals are picked out. Caps and international goals are tracked for every player. Caps before 2026/27 are estimates, since there's no complete public record.
- **The June window** comes after the club season, so it's played at the end of the season for results and caps only: the Nations League Finals (a trophy) and the next Euro 2028 qualifiers.
- **Later seasons** carry on: Euro 2028 qualifying finishes in autumn 2027, CONMEBOL starts its World Cup 2030 qualifying league, and each confederation draws new qualifying groups (Nations League, Euro and World Cup qualifying in turn for UEFA).
- **Screens:** an **Internationals** screen with your internationals (caps, goals, this season, who's away and until when), fixtures and results by window (your nations or every game) and every competition's tables and knockouts. The player page shows caps, goals and international duty.

Fitness now recovers day by day, so a player who plays several internationals comes back genuinely short of fitness rather than fully recovered by the next club game.

## Scouting

You know your own players exactly. Everyone else is seen through a fog, as in CM 01/02:

- **Attributes** show as ranges (for example 9–15) that narrow as you learn more. Once you know about 85% of a player, they're exact. The true value is always inside the range, and a range doesn't jump about between screens.
- **Ability** everywhere (search, club squads, shortlist, "players to watch") is your best estimate, shown with dimmed stars. **Potential** is unknown until a scout reports on the player, and condition and morale stay hidden.
- **Common knowledge** depends on the player: stars are household names, players in your own league and at big clubs are better known, and unknown teenagers abroad are a mystery. Every time a player faces your side you learn a little more. Knowledge fades a little each summer.
- **Scouts** have two judgement ratings (1–20), one for current ability and one for potential, plus a league they know best. Their reports carry their own errors, so a poor judge can misread a player. Scouts are quicker and sharper in their home league, and trips abroad take longer and cost more.
- **Assignments:**
  - Watch a player: about a week, then a full report.
  - Watch a club: about two weeks, with better knowledge of the whole squad and reports on its best players.
  - Tour a league: about five weeks, looking for the best players, young talent (21 and under) or affordable players. The better the scout, the better the players he turns up.
- **Reports** give estimated ability and potential stars, strengths and weaknesses, hidden traits a good judge can spot (injury-prone, inconsistent, big-game player), and a verdict judged against your first team: Sign, Consider, One for the future, Squad player or No.
- **Staff and money:** you inherit a staff sized to the club and can employ up to 2 + half the club's reputation. You can hire from a pool that changes each summer, or let a scout go (a month's wages). Wages come out of club funds monthly. Travel comes out of a scouting budget the board sets each summer (about 0.2% of revenue). Both appear as "Scouting" in the accounts.
- The **Scouting** screen has your scouts and their assignments, all reports (best recommendations first), your shortlist (with one-click scouting) and scouts for hire. Player profiles show how much you know, the latest report, a "send scout" control and a shortlist button.

## How the match engine works

1. Each player contributes to his side's **defence / midfield / attack** according to his slot's role. The contribution is scaled by positional familiarity, condition, morale and a per-match form roll whose size depends on the consistency attribute.
2. Each minute, possession goes to one side, weighted by midfield strength. The side on the ball creates a chance with probability `chanceBase × (attack / opposition defence)^k`. That probability is adjusted for mentality, passing style, counter-attacking and game state (sides that are behind push harder late on, and AI managers change mentality to suit the score).
3. A chance has a type: through ball, counter, cross, long shot, box scramble, corner, free kick or penalty. The mix depends on passing style. The type decides who shoots, who assists, and which attributes decide it.
4. **Team instructions:**
   - Closing down trades opposition attack against fatigue.
   - Hard tackling trades opposition attack against fouls and cards.
   - The offside trap flags runners, but a beaten trap leaves the keeper exposed.
   - Counter-attack pays off against sides that commit forward.
5. Fatigue, cards, injuries and substitutions (five, in three stoppages) feed back into team strength. Keepers tire at about a third of an outfielder's rate, and a high press barely affects them. AI managers change one or two players at a time. An injured player left on the pitch plays at about half strength. Ratings build up from goals, assists, saves, tackles and goals conceded.

Balance over 12 simulated seasons (`npm run balance 12`):

| League | Goals/game | Home/Draw/Away | Yellows/game | Champion's points | Most titles |
|---|---|---|---|---|---|
| Premier League | 2.75 | 43/26/31% | 3.9 | 81 | Arsenal 5, Liverpool 3, City 3 |
| La Liga | 2.96 | 43/25/32% | 3.5 | 89 | Real Madrid 7, Atlético 3 |
| Bundesliga | 2.90 | 43/25/31% | 3.8 | 78 | Bayern 8, Dortmund 3 |
| Serie A | 2.73 | 42/26/31% | 3.9 | 84 | Juventus 4, Inter 4, Roma 2 |
| Ligue 1 | 3.06 | 43/24/33% | 3.1 | 82 | PSG 12 |
| Primeira Liga | 3.02 | 43/26/31% | 3.6 | 81 | Porto 7, Sporting 4 |

La Liga and the Primeira Liga score a little more than they do in real life (about 2.6 a game). The engine does not yet give each league its own style.

## Known limitations and roadmap

League fixtures are on the real 2026/27 dates, but the pairings on each date are generated (the real fixture lists aren't in the database). Suspensions and yellow-card totals count across all competitions rather than per competition. Below the last played division of each country the clubs aren't played: each country has a pool of 20-24 that supplies the replacements. Third tiers for Spain, Germany, Italy, France and Portugal are not in yet, and Germany, France and Portugal have no promotion play-off.

EFL squads are real, but most EFL players' ages, positions and ratings are Touchline's estimates, and a few clubs' Wikipedia lists were out of date when they were read (a player may be at his previous club). The second tiers of Spain, Germany, Italy, France and Portugal (about 2,650 players) are real too, from Wikipedia where its list was current and otherwise from the league's or club's own site or a squad aggregator (September–October 2026); the same caveats apply, and a handful of lists (Tenerife, Clermont, Belenenses, Académica) were hard to confirm. The Portuguese second tier leaves out the B teams of Benfica, Porto and Sporting (they can't be promoted), so its last three places go to Paços de Ferreira, Belenenses and Oliveirense from Liga 3. Real contract lengths, wages and fees paid aren't public for most players, so they're generated to fit each club's finances.

Summer tournaments (AFCON 2027, the Gold Cup) happen after the club season and aren't played. Player traits are in (see below). Next: a database editor, and third tiers for the other countries.
