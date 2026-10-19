import type { Gear, ScoreRun, Session, ToneRun } from './db';
import { addDays } from './dates';
import type { InstrumentId } from '../instruments/current';

/* ---------------- 음정 습관 지도 ---------------- */

export interface Habit { midi: number; mean: number; n: number }

/**
 * 최근 기록에서 음별 평균 음정 (부호 있는 센트).
 * 악보 채점은 맞은 음 하나하나, 롱톤은 한 번을 3음 무게로 (길게 분 음이라 믿을 만함).
 */
export function habitMap(scoreRuns: Pick<ScoreRun, 'date' | 'noteCents'>[], toneRuns: Pick<ToneRun, 'date' | 'kind' | 'midi' | 'meanCents'>[], since: string): Habit[] {
  const m = new Map<number, [number, number]>();
  const add = (midi: number, sum: number, n: number) => { const v = m.get(midi) ?? [0, 0]; v[0] += sum; v[1] += n; m.set(midi, v); };
  for (const r of scoreRuns) if (r.date >= since) for (const [midi, s, n] of r.noteCents ?? []) add(midi, s, n);
  for (const r of toneRuns) if (r.date >= since && r.kind === 'long' && r.midi !== undefined && typeof r.meanCents === 'number') add(r.midi, r.meanCents * 3, 3);
  return [...m.entries()].map(([midi, [s, n]]) => ({ midi, mean: s / n, n })).sort((a, b) => a.midi - b.midi);
}

/** 믿을 만한 음(3번 이상) 중 가장 벗어난 음들 */
export function worstHabits(h: Habit[], k = 3, minN = 3, minCents = 8): Habit[] {
  return h.filter((x) => x.n >= minN && Math.abs(x.mean) >= minCents).sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean)).slice(0, k);
}

/** 전체 경향 (음 수 가중 평균) */
export function overallBias(h: Habit[]): number | null {
  const n = h.reduce((a, x) => a + x.n, 0);
  return n >= 10 ? h.reduce((a, x) => a + x.mean * x.n, 0) / n : null;
}

/** 음 하나에 대한 고치는 법 (악보음 midi) */
export function habitTip(inst: InstrumentId, midi: number, mean: number): string {
  const sharp = mean > 0;
  if (inst === 'clarinet') {
    if (midi >= 67 && midi <= 70) {
      return sharp
        ? '스로트 음(G4~B♭4)은 높고 가늘게 나기 쉬워요. 오른손 손가락 몇 개(링 키)를 덮는 "레조넌스 운지"를 쓰면 음이 내려가고 소리가 굵어져요.'
        : '스로트 음이 낮으면 숨 속도를 조금 올리고, 왼손 엄지·검지가 키를 정확히 누르는지 확인하세요.';
    }
    if (midi >= 84) return sharp ? '알티시모 음은 입술을 조여서 올리기 쉬워요. 입술 힘은 그대로 두고 숨 속도로 소리를 받치세요.' : '알티시모가 낮으면 숨을 더 빠르게, 혀 위치를 "이" 모양으로 높여 보세요.';
    if (midi >= 71 && midi <= 74) return sharp ? '브레이크 바로 위 음이 높아요. 리드를 깨물지 말고 아랫입술 힘을 빼 보세요.' : '브레이크 위 음(B4~D5)은 낮게 나기 쉬워요. 숨을 빠르게, 입술은 그대로.';
    if (midi < 60) return sharp ? '낮은 음이 높게 나요. 입을 조금 더 열고 턱을 내려 따뜻한 바람으로.' : '낮은 음이 낮아요. 아래쪽 키·링이 다 막혔는지(새는 곳) 먼저 확인하세요.';
    return sharp ? '높게 나요. 아랫입술로 리드를 덜 누르고(깨물지 않기) 턱을 살짝 내려 보세요.' : '낮게 나요. 숨을 더 빠르게 보내고 입꼬리로 마우스피스를 감싸 지지하세요.';
  }
  // 플룻
  if (midi >= 86) return sharp ? '3옥타브 높은 음이 높아요. 입술 구멍을 작게 유지하되 바람 방향을 조금 아래로, 헤드조인트를 살짝 안으로 돌려 보세요.' : '높은 음이 낮으면 바람 속도를 올리고 입술 구멍을 더 작게.';
  if (midi < 67) return sharp ? '낮은 음이 높아요. 바람을 느리고 따뜻하게, 방향은 조금 아래로.' : '낮은 음이 낮게 나기 쉬워요. 입술을 앞으로 내밀어 바람 방향을 조금 위로, 너무 많이 덮지 마세요.';
  return sharp ? '높게 나요. 바람 방향을 조금 아래로(턱을 살짝 내리거나 입술로 구멍을 더 덮기).' : '낮게 나요. 바람 방향을 조금 위로(아랫입술을 앞으로), 덮은 부분을 줄여 보세요.';
}
export function biasTip(inst: InstrumentId, bias: number): string | null {
  if (Math.abs(bias) < 8) return null;
  const part = inst === 'clarinet' ? '배럴을' : '헤드조인트를';
  return bias > 0 ? `전체적으로 ${Math.round(bias)}센트쯤 높아요. 입 모양을 고치기 전에 ${part} 조금 빼 보세요.` : `전체적으로 ${Math.round(-bias)}센트쯤 낮아요. ${part} 조금 넣어 보세요.`;
}

/* ---------------- 주별 추이 ---------------- */

export interface WeekRow {
  /** 그 주 월요일 */
  start: string;
  minutes: number;
  longBest: number | null;
  longSD: number | null;
  tongueBpm: number | null;
  scorePct: number | null;
  breakClean: number | null;
  echoPct: number | null;
}

export const mondayOf = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  const dow = (new Date(y, m - 1, day).getDay() + 6) % 7;
  return addDays(d, -dow);
};

/** 최근 weeks 주 (오래된 주부터) */
export function weeklyTrends(sessions: Pick<Session, 'date' | 'totalSec'>[], scoreRuns: Pick<ScoreRun, 'date' | 'ok' | 'total' | 'durationSec' | 'inSession'>[], toneRuns: ToneRun[], today: string, weeks = 8): WeekRow[] {
  const first = addDays(mondayOf(today), -7 * (weeks - 1));
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, i) => ({ start: addDays(first, 7 * i), minutes: 0, longBest: null, longSD: null, tongueBpm: null, scorePct: null, breakClean: null, echoPct: null }));
  const idx = (d: string) => { if (d < first) return -1; const i = rows.findIndex((r, k) => d >= r.start && (k === rows.length - 1 || d < rows[k + 1].start)); return i; };
  const acc = rows.map(() => ({ sd: [] as number[], pct: [] as number[], brk: [0, 0], echo: [0, 0] }));
  for (const s of sessions) { const i = idx(s.date); if (i >= 0) rows[i].minutes += s.totalSec / 60; }
  for (const r of scoreRuns) {
    const i = idx(r.date); if (i < 0) continue;
    if (!r.inSession) rows[i].minutes += r.durationSec / 60;
    if (r.total >= 4) acc[i].pct.push((r.ok / r.total) * 100);
  }
  for (const r of toneRuns) {
    const i = idx(r.date); if (i < 0) continue;
    if (r.kind === 'long') {
      if (r.durationSec) rows[i].longBest = Math.max(rows[i].longBest ?? 0, r.durationSec);
      if (typeof r.centsSD === 'number') acc[i].sd.push(r.centsSD);
    } else if (r.kind === 'tongue') {
      if (r.bpm && r.expected && (r.hits ?? 0) / r.expected >= 0.85) rows[i].tongueBpm = Math.max(rows[i].tongueBpm ?? 0, r.bpm);
    } else if (r.kind === 'break') {
      acc[i].brk[0] += r.clean ?? 0; acc[i].brk[1] += r.hits ?? 0;
    } else if (r.kind === 'echo') {
      acc[i].echo[0] += r.hits ?? 0; acc[i].echo[1] += r.expected ?? 0;
    }
  }
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  rows.forEach((r, i) => {
    r.minutes = Math.round(r.minutes);
    r.longSD = mean(acc[i].sd);
    r.scorePct = mean(acc[i].pct);
    r.breakClean = acc[i].brk[1] ? (acc[i].brk[0] / acc[i].brk[1]) * 100 : null;
    r.echoPct = acc[i].echo[1] ? (acc[i].echo[0] / acc[i].echo[1]) * 100 : null;
  });
  return rows;
}

/* ---------------- 리드(헤드조인트)별 ---------------- */

export interface GearStat { gear: Gear; uses: number; last: string | null; longSD: number | null; longBest: number | null; scorePct: number | null }
export function gearStats(gear: Gear[], toneRuns: ToneRun[], scoreRuns: Pick<ScoreRun, 'date' | 'gearId' | 'ok' | 'total'>[]): GearStat[] {
  return gear.map((g) => {
    const tr = toneRuns.filter((r) => r.gearId === g.id);
    const sr = scoreRuns.filter((r) => r.gearId === g.id);
    const longs = tr.filter((r) => r.kind === 'long');
    const sds = longs.map((r) => r.centsSD).filter((x): x is number => typeof x === 'number');
    const pcts = sr.filter((r) => r.total >= 4).map((r) => (r.ok / r.total) * 100);
    const dates = [...tr.map((r) => r.date), ...sr.map((r) => r.date)].sort();
    return {
      gear: g,
      uses: tr.length + sr.length,
      last: dates.length ? dates[dates.length - 1] : null,
      longSD: sds.length ? sds.reduce((a, b) => a + b, 0) / sds.length : null,
      longBest: longs.length ? Math.max(...longs.map((r) => r.durationSec ?? 0)) : null,
      scorePct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    };
  });
}
