/**
 * The Ballon d'Or, every autumn, for the season just ended and the summer's tournaments (as the real
 * award has been judged since 2024: the season from August to July). With it, the Kopa Trophy for the
 * best player aged 21 or under and the Yashin Trophy for the best goalkeeper.
 *
 *  - When a season ends, every candidate gets a score from that season: his ability, goals, assists
 *    and average rating in all competitions, clean sheets for keepers and defenders, and his club's
 *    trophies (league title in a top division, Champions League, Europa League, domestic cup).
 *    Attackers get a little more, as the voting does.
 *  - In early August the summer's tournaments are added (winners, finalists, semi-finalists, goals,
 *    player and young player of the tournament) and the 30 nominees are named in the inbox.
 *  - The ceremony is at the end of September: the ranking, the Kopa and Yashin trophies.
 *  - The winner gains fame (his value rises by up to 35%, and everyone knows more about him), morale
 *    and the honour on his profile; second and third gain less; so do the Kopa and Yashin winners.
 *
 * The 2026 award, the first in a career, has no season in the game to judge, so it goes on ability,
 * club standing and the 2026 World Cup.
 */
import { hashString, POS_ROLE } from './attributes.js';
import { dayOfDate } from './calendar.js';
import { isExtPlayer } from './ext.js';
import { addNews, dayLabel } from './game.js';
import { tierOf } from './levels.js';
import type { AwardPick, BallonEdition, BallonState, GameState, Player, Pos } from './types.js';

/** Nominees in the first week of August; the ceremony on the last Monday of September. */
export function ballonDays(season: number): { shortlist: number; ceremony: number } {
  const shortlist = dayOfDate(season, new Date(Date.UTC(season, 7, 7)));
  let ceremony = dayOfDate(season, new Date(Date.UTC(season, 8, 30)));
  while (new Date(Date.UTC(season, 7, 1 + ceremony)).getUTCDay() !== 1) ceremony--;
  return { shortlist, ceremony };
}

const fullName = (p: Player) => `${p.firstName} ${p.lastName}`.trim();
const pick = (p: Player): AwardPick => ({ id: p.id, name: fullName(p), nation: p.nation, clubId: p.clubId });
const primary = (p: Player): Pos => (Object.keys(p.pos) as Pos[]).find((k) => p.pos[k] === 20) ?? 'MC';
const isGk = (p: Player) => (p.pos.GK ?? 0) >= 20;

function ballon(state: GameState): BallonState {
  state.ballon ??= { editions: [] };
  return state.ballon;
}

/** Candidates: players at clubs in the six leagues who are good enough to be considered. */
function candidates(state: GameState): Player[] {
  return Object.values(state.players).filter((p) => p.clubId !== null && !isExtPlayer(p) && (p.ca >= 135 || (p.age <= 21 && p.ca >= 115)));
}

/** A player's season in one number, and the reasons in words. */
function seasonScore(state: GameState, p: Player, firstYear: boolean): { score: number; why: string[] } {
  const why: string[] = [];
  let score = (p.ca - 145) * 0.5;
  const role = POS_ROLE[primary(p)];
  score += role === 'ST' || role === 'AW' || role === 'AM' ? 3 : role === 'CM' || role === 'WM' ? 1 : role === 'GK' ? -4 : role === 'DM' ? 0 : -2;
  score += (p.fame ?? 0) * 1.5;
  const c = p.clubId ? state.clubs.find((x) => x.id === p.clubId) : undefined;
  if (firstYear) {
    // No season in the game yet: the club's standing stands in for its trophies.
    if (c) score += Math.max(0, c.reputation - 6) * 1.5;
    return { score, why };
  }
  const st = p.stats;
  const apps = st.apps + st.subApps;
  if (apps >= 10) {
    score += st.goals * 0.45 + st.assists * 0.3 + (st.ratingSum / apps - 6.9) * 8;
    if (role === 'GK') score += st.cleanSheets * 0.4;
    else if (role === 'CB' || role === 'FB') score += st.cleanSheets * 0.15;
    if (st.goals >= 15) why.push(`${st.goals} goals`);
    if (st.assists >= 12) why.push(`${st.assists} assists`);
    if (role === 'GK' && st.cleanSheets >= 15) why.push(`${st.cleanSheets} clean sheets`);
  } else score -= 6;
  // His club's trophies (the season record was written just before this is called).
  const rec = state.history[state.history.length - 1];
  if (c && rec) {
    if (rec.champions[c.leagueId] === c.id && tierOf(c.leagueId) === 1) {
      score += c.leagueId === 'ENG' || c.leagueId === 'ESP' ? 6 : 5;
      why.push(`${state.comps.find((k) => k.id === c.leagueId)?.name ?? 'League'} champions`);
    }
    for (const cup of state.cups) {
      if (cup.winnerId !== c.id) continue;
      const add = cup.id === 'UCL' ? 10 : cup.id === 'UEL' ? 3 : cup.id === 'UECL' ? 1.5 : cup.kind === 'cup' ? 2 : 0;
      if (!add) continue;
      score += add;
      why.push(`${cup.name} winners`);
    }
    const ucl = state.cups.find((x) => x.id === 'UCL');
    const final = ucl?.ties.filter((t) => t.round === Math.max(...ucl.ties.map((x) => x.round)))[0];
    if (final && final.winnerId && final.winnerId !== c.id && (final.homeId === c.id || final.awayId === c.id)) {
      score += 4;
      why.push('Champions League finalists');
    }
  }
  return { score, why };
}

/** When a season ends (before the statistics are cleared): the scores for next autumn's award. */
export function ballonSnapshot(state: GameState, firstYear = false, year = state.season + 1): void {
  const b = ballon(state);
  const cands = candidates(state).map((p) => ({ id: p.id, ...seasonScore(state, p, firstYear) }));
  // The best 120, plus the best young players and keepers, for the Kopa and Yashin trophies.
  const keep = new Set<number>();
  const by = (xs: typeof cands) => [...xs].sort((a, b2) => b2.score - a.score);
  by(cands).slice(0, 120).forEach((c) => keep.add(c.id));
  by(cands.filter((c) => state.players[c.id].age <= 21)).slice(0, 20).forEach((c) => keep.add(c.id));
  by(cands.filter((c) => isGk(state.players[c.id]))).slice(0, 20).forEach((c) => keep.add(c.id));
  b.pending = { year, cands: cands.filter((c) => keep.has(c.id)) };
}

/** The summer's tournaments: what each candidate did there. */
function tournamentScore(state: GameState, id: number): { score: number; why: string[] } {
  const p = state.players[id];
  const why: string[] = [];
  let score = 0;
  for (const t of state.intl.tournaments ?? []) {
    if (t.year !== state.season) continue;
    const games = state.intl.matches.filter((m) => m.comp === t.id && m.result);
    const apps = games.filter((m) => m.result!.played?.includes(id)).length;
    if (!apps) continue;
    const goals = games.reduce((n, m) => n + m.result!.scorers.filter(([x]) => x === id).length, 0);
    score += goals * 1.2 + apps * 0.3;
    const sf = games.filter((m) => m.stage === 'Semi-finals').some((m) => m.home === p.nation || m.away === p.nation);
    if (t.winner === p.nation) { score += 8; why.push(`${t.name} winner`); } else if (t.runnerUp === p.nation) { score += 4; why.push(`${t.name} finalist`); } else if (sf) score += 2;
    if (t.player?.id === id) { score += 6; why.push(`player of the ${t.name}`); }
    if (t.young?.id === id) { score += 2; why.push(`young player of the ${t.name}`); }
    if (goals >= 4) why.push(`${goals} goals at the ${t.name}`);
  }
  return { score, why };
}

/** A little uncertainty in the voting, fixed per player and year. */
const vote = (id: number, year: number) => ((hashString(`ballon:${year}:${id}`) % 1000) / 1000 - 0.5) * 3;

/** Called every day: the nominees in August, the ceremony in September. */
export function ballonDay(state: GameState): void {
  if (!state.userClubId) return;
  const b = ballon(state);
  const { shortlist, ceremony } = ballonDays(state.season);
  const year = state.season;
  let ed = b.editions.find((e) => e.year === year);
  if (!ed && state.day >= shortlist && state.day < ceremony + 7) {
    if (!b.pending || b.pending.year !== year) ballonSnapshot(state, true, year);
    const scored = b.pending!.cands
      .filter((c) => state.players[c.id]?.clubId !== null && state.players[c.id])
      .map((c) => {
        const t = tournamentScore(state, c.id);
        return { ...c, score: c.score + t.score + vote(c.id, year), why: [...t.why, ...c.why] };
      })
      .sort((a, x) => x.score - a.score);
    ed = {
      year,
      nominees: scored.slice(0, 30).map((c) => ({ ...pick(state.players[c.id]), score: Math.round(c.score * 10) / 10, why: c.why.slice(0, 2).join(', ') })),
      shortlisted: true,
      done: false,
    };
    // Kopa and Yashin: decided now, announced at the ceremony.
    const young = scored.find((c) => state.players[c.id].age <= 21);
    const keeper = scored.find((c) => isGk(state.players[c.id]));
    if (young) ed.kopa = pick(state.players[young.id]);
    if (keeper) ed.yashin = pick(state.players[keeper.id]);
    b.editions.push(ed);
    b.pending = undefined;
    nomineesNews(state, ed);
  }
  if (ed && !ed.done && state.day >= ceremony) {
    ed.done = true;
    ceremonyNews(state, ed);
    reward(state, ed);
  }
}

const clubName = (state: GameState, id: number | null) => (id ? state.clubs.find((c) => c.id === id)?.name ?? '' : '');
const mine = (state: GameState) => new Set(state.clubs.find((c) => c.id === state.userClubId)?.playerIds ?? []);

function nomineesNews(state: GameState, ed: BallonEdition): void {
  const ours = ed.nominees.filter((n) => mine(state).has(n.id));
  const { ceremony } = ballonDays(state.season);
  addNews(state, {
    kind: 'award',
    title: `Ballon d'Or ${ed.year}: the 30 nominees`,
    body: `The 30 nominees for the ${ed.year} Ballon d'Or have been named, for the ${ed.year - 1}/${String(ed.year % 100).padStart(2, '0')} season and the summer's internationals. The Kopa Trophy (best player aged 21 or under) and the Yashin Trophy (best goalkeeper) are presented at the ceremony on ${dayLabel(state.season, ceremony)}.${ours.length ? ` From your squad: ${ours.map((n) => n.name).join(', ')}.` : ''}`,
    players: [...ed.nominees].sort((a, b) => a.name.localeCompare(b.name)).map((n) => ({ id: n.id, note: clubName(state, n.clubId) })),
    link: { label: "Ballon d'Or", screen: 'stats', tab: 'ballon' },
  });
}

function ceremonyNews(state: GameState, ed: BallonEdition): void {
  const [w, s2, s3] = ed.nominees;
  const ours = ed.nominees.map((n, i) => ({ n, i })).filter(({ n }) => mine(state).has(n.id));
  const ord = (i: number) => `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}`;
  addNews(state, {
    kind: 'award',
    title: `${w.name} wins the Ballon d'Or ${ed.year}`,
    body: `${w.name} (${clubName(state, w.clubId)}) has won the ${ed.year} Ballon d'Or${w.why ? `: ${w.why}` : ''}. ${s2 ? `${s2.name} was second and ${s3?.name ?? ''} third.` : ''}${ed.kopa ? ` Kopa Trophy: ${ed.kopa.name} (${clubName(state, ed.kopa.clubId)}).` : ''}${ed.yashin ? ` Yashin Trophy: ${ed.yashin.name} (${clubName(state, ed.yashin.clubId)}).` : ''}${ours.length ? ` Your players: ${ours.map(({ n, i }) => `${n.name} ${ord(i)}`).join(', ')}.` : ''}`,
    players: ed.nominees.slice(0, 10).map((n, i) => ({ id: n.id, note: `${ord(i)} · ${clubName(state, n.clubId)}` })),
    link: { label: "Ballon d'Or", screen: 'stats', tab: 'ballon' },
  });
}

/** Fame, morale and the honour for the winners. */
function reward(state: GameState, ed: BallonEdition): void {
  const give = (id: number | undefined, what: string, fame: number, morale: number) => {
    const p = id !== undefined ? state.players[id] : undefined;
    if (!p) return;
    p.fame = (p.fame ?? 0) + fame;
    p.morale = Math.min(99, p.morale + morale);
    p.honours = [...(p.honours ?? []), what];
  };
  give(ed.nominees[0]?.id, `Ballon d'Or ${ed.year}`, 3, 15);
  give(ed.nominees[1]?.id, `Ballon d'Or ${ed.year}: 2nd`, 1.5, 8);
  give(ed.nominees[2]?.id, `Ballon d'Or ${ed.year}: 3rd`, 1.5, 8);
  give(ed.kopa?.id, `Kopa Trophy ${ed.year}`, 1, 8);
  give(ed.yashin?.id, `Yashin Trophy ${ed.year}`, 1, 8);
}

/** Every summer, fame fades a little. */
export function fadeFame(state: GameState): void {
  for (const p of Object.values(state.players)) if (p.fame) p.fame = p.fame * 0.75 < 0.05 ? 0 : p.fame * 0.75;
}
