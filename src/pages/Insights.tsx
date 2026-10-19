import { useMemo, useState } from 'react';
import { useSessions } from '../state/useSessions';
import { useScoreRuns } from '../state/useScoreRuns';
import { useToneRuns } from '../state/useToneRuns';
import { useGear, setCurrentGear, addGear, GEAR } from '../state/useGear';
import { addDays, localDate } from '../data/dates';
import { habitMap, worstHabits, overallBias, habitTip, biasTip, weeklyTrends, gearStats, type Habit, type WeekRow } from '../data/insights';
import { prettyName } from '../audio/notes';
import { centsText } from '../components/CentsGauge';
import { P } from '../instruments/profiles';
import { db } from '../data/db';

/** 기록 → 분석: 주별 추이, 음정 습관 지도, 리드(헤드조인트)별 */
export function Insights() {
  const sessions = useSessions();
  const scoreRuns = useScoreRuns();
  const toneRuns = useToneRuns();
  const today = localDate();
  const [days, setDays] = useState(30);
  const weeks = useMemo(() => weeklyTrends(sessions, scoreRuns, toneRuns, today, 8), [sessions, scoreRuns, toneRuns, today]);
  const habits = useMemo(() => habitMap(scoreRuns, toneRuns, addDays(today, -days)), [scoreRuns, toneRuns, today, days]);
  return (
    <div className="page-sub insights" data-testid="insights">
      <TrendsCard weeks={weeks} />
      <HabitCard habits={habits} days={days} setDays={setDays} />
      <GearCard />
    </div>
  );
}

/* ---------------- 주별 추이 ---------------- */

const METRICS: { key: keyof WeekRow; title: string; unit: string; fmt: (v: number) => string; better: string }[] = [
  { key: 'minutes', title: '연습 시간', unit: '분', fmt: (v) => `${Math.round(v)}분`, better: '' },
  { key: 'longBest', title: '롱톤 가장 길게', unit: '초', fmt: (v) => `${v.toFixed(1)}초`, better: '높을수록 좋아요' },
  { key: 'longSD', title: '롱톤 음정 흔들림', unit: '센트', fmt: (v) => `±${v.toFixed(1)}`, better: '낮을수록 좋아요' },
  { key: 'tongueBpm', title: '텅잉 통과 템포', unit: '♩', fmt: (v) => `♩${Math.round(v)}`, better: '높을수록 좋아요' },
  { key: 'scorePct', title: '악보 맞은 음', unit: '%', fmt: (v) => `${Math.round(v)}%`, better: '높을수록 좋아요' },
  { key: 'breakClean', title: '넘기 깨끗하게', unit: '%', fmt: (v) => `${Math.round(v)}%`, better: '높을수록 좋아요' },
  { key: 'echoPct', title: '따라 불기 맞힌 음', unit: '%', fmt: (v) => `${Math.round(v)}%`, better: '높을수록 좋아요' },
];
const wk = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

function TrendsCard({ weeks }: { weeks: WeekRow[] }) {
  const [table, setTable] = useState(false);
  const shown = METRICS.filter((m) => weeks.some((w) => w[m.key] !== null && w[m.key] !== 0));
  return (
    <div className="card" data-testid="trends">
      <div className="card-head"><b>주별 추이</b><button className="mini" onClick={() => setTable(!table)} data-testid="trends-table">{table ? '그래프로' : '표로'}</button></div>
      {shown.length <= 1 && <p className="muted small">롱톤·텅잉·악보 채점을 하면 주마다 얼마나 늘었는지 여기 보여요.</p>}
      {table ? (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>주</th>{shown.map((m) => <th key={m.key}>{m.title}</th>)}</tr></thead>
            <tbody>{weeks.map((w) => <tr key={w.start}><td>{wk(w.start)}</td>{shown.map((m) => <td key={m.key}>{w[m.key] === null ? '—' : m.fmt(w[m.key] as number)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="trend-grid">
          {shown.map((m) => <WeekBars key={m.key} weeks={weeks} m={m} />)}
        </div>
      )}
    </div>
  );
}

/** 지표 하나: 8주 막대 (한 계열이라 범례 없이 제목으로) */
function WeekBars({ weeks, m }: { weeks: WeekRow[]; m: (typeof METRICS)[number] }) {
  const vals = weeks.map((w) => (w[m.key] as number | null));
  const max = Math.max(1e-9, ...vals.map((v) => v ?? 0));
  const lastIdx = vals.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
  const prev = lastIdx !== undefined ? vals.slice(0, lastIdx).filter((v): v is number => v !== null).pop() : undefined;
  const W = 160, H = 44, gap = 2, bw = (W - gap * (weeks.length - 1)) / weeks.length;
  return (
    <div className="trend">
      <div className="trend-head">
        <span className="small">{m.title}</span>
        <b>{lastIdx !== undefined ? m.fmt(vals[lastIdx]!) : '—'}</b>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-bars" role="img" aria-label={`${m.title} 주별: ${weeks.map((w, i) => `${wk(w.start)} ${vals[i] === null ? '없음' : m.fmt(vals[i]!)}`).join(', ')}`}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="axis" />
        {vals.map((v, i) => {
          const h = v === null ? 0 : Math.max(2, (v / max) * (H - 4));
          return (
            <g key={i}>
              <rect x={i * (bw + gap)} y={0} width={bw} height={H} className="hit"><title>{wk(weeks[i].start)} 주 · {v === null ? '기록 없음' : m.fmt(v)}</title></rect>
              {v !== null && <path d={roundTop(i * (bw + gap), H, bw, h)} className={`bar ${i === lastIdx ? 'now' : ''}`} />}
            </g>
          );
        })}
      </svg>
      <span className="muted small">{prev !== undefined && lastIdx !== undefined ? `지난번 ${m.fmt(prev)}` : ' '}{m.better ? ` · ${m.better}` : ''}</span>
    </div>
  );
}
/** 위만 둥근 막대 (아래는 바닥에 붙음) */
function roundTop(x: number, base: number, w: number, h: number) {
  const r = Math.min(3, w / 2, h);
  return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + w - r}Q${x + w},${base - h} ${x + w},${base - h + r}V${base}Z`;
}

/* ---------------- 음정 습관 지도 ---------------- */

function HabitCard({ habits, days, setDays }: { habits: Habit[]; days: number; setDays: (d: number) => void }) {
  const reliable = habits.filter((h) => h.n >= 3);
  const worst = worstHabits(habits);
  const bias = overallBias(habits);
  const bt = bias === null ? null : biasTip(P.id, bias);
  const R = 30; // ±30센트까지 그림
  return (
    <div className="card" data-testid="habits">
      <div className="card-head">
        <b>음정 습관 지도</b>
        <span className="chips">{[14, 30, 90].map((d) => <button key={d} className={`chip ${d === days ? 'on' : ''}`} onClick={() => setDays(d)}>{d}일</button>)}</span>
      </div>
      {reliable.length === 0 ? <p className="muted small">악보 채점과 롱톤을 하면 음마다 평소에 높게·낮게 부는지 모여요. (음마다 3번 이상 모이면 보여요)</p> : (
        <>
          <div className="habit-legend small"><span className="sw sharp" /> 높게 ↑ <span className="sw flat" /> 낮게 ↓ <span className="muted">· 가운데 줄 = 딱 맞음, 양 끝 ±{R}센트</span></div>
          <ul className="habit-list">
            {reliable.map((h) => {
              const v = Math.max(-R, Math.min(R, h.mean));
              const cls = Math.abs(h.mean) < 5 ? 'ok' : h.mean > 0 ? 'sharp' : 'flat';
              return (
                <li key={h.midi} title={`${prettyName(h.midi)} 평균 ${centsText(h.mean)}센트 · ${h.n}음`}>
                  <span className="hn">{prettyName(h.midi)}</span>
                  <span className="hbar"><span className="zero" /><span className={`fill ${cls}`} style={v >= 0 ? { left: '50%', width: `${(v / R) * 50}%` } : { right: '50%', width: `${(-v / R) * 50}%` }} /></span>
                  <span className="hv">{centsText(h.mean)}<small className="muted"> {h.n}</small></span>
                </li>
              );
            })}
          </ul>
          {(worst.length > 0 || bt) && (
            <div className="habit-tips">
              <b className="small">이렇게 고쳐 보세요</b>
              <ul className="advice">
                {bt && <li>{bt}</li>}
                {worst.map((h) => <li key={h.midi}><b>{prettyName(h.midi)} {h.mean > 0 ? '높음' : '낮음'} ({centsText(h.mean)})</b> — {habitTip(P.id, h.midi, h.mean)}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 리드(헤드조인트)별 ---------------- */

function GearCard() {
  const { list, current } = useGear();
  const toneRuns = useToneRuns();
  const scoreRuns = useScoreRuns();
  const [showRetired, setShowRetired] = useState(false);
  const stats = useMemo(() => gearStats(list, toneRuns, scoreRuns), [list, toneRuns, scoreRuns]);
  const shown = stats.filter((s) => showRetired || !s.gear.retired);
  async function add() {
    const label = prompt(`새 ${GEAR.one} 이름 (${GEAR.labelExample})`, `#${list.length + 1}`);
    if (label === null) return;
    const detail = prompt(`${GEAR.detail} (${GEAR.example}, 비워도 돼요)`, '') ?? '';
    await addGear(label, detail);
  }
  return (
    <div className="card" data-testid="gear-card">
      <div className="card-head"><b>{GEAR.name} 기록</b><button className="mini" onClick={add} data-testid="gear-add">＋ 새 {GEAR.one}</button></div>
      <p className="hint">{P.id === 'flute'
        ? '헤드조인트를 얼마나 뺐는지 기록해 두면, 위치마다 롱톤 흔들림과 채점 결과를 비교할 수 있어요. 기초 탭이나 악보 채점 화면에서 지금 위치를 고르세요.'
        : '리드마다 번호를 붙여 두면 리드별로 롱톤 흔들림·가장 길게·채점 결과를 비교할 수 있어요. 기초 탭이나 악보 채점 화면에서 지금 쓰는 리드를 고르세요. 리드는 3~4개를 돌려 가며 쓰면 오래가요.'}</p>
      {shown.length === 0 ? <p className="muted small">아직 없어요.</p> : (
        <div className="tbl-wrap">
          <table className="tbl gear-tbl">
            <thead><tr><th>{GEAR.one}</th><th>쓴 횟수</th><th>롱톤 흔들림</th><th>가장 길게</th><th>맞은 음</th><th /></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.gear.id} className={s.gear.retired ? 'muted' : ''}>
                  <td><b>{s.gear.label}</b>{s.gear.id === current ? <span className="badge">지금</span> : null}<br /><span className="muted small">{s.gear.detail ?? ''}{s.last ? ` · ${s.last.slice(5)}` : ''}</span></td>
                  <td>{s.uses}</td>
                  <td>{s.longSD === null ? '—' : `±${s.longSD.toFixed(1)}`}</td>
                  <td>{s.longBest === null ? '—' : `${s.longBest.toFixed(1)}초`}</td>
                  <td>{s.scorePct === null ? '—' : `${Math.round(s.scorePct)}%`}</td>
                  <td className="gear-actions">
                    {!s.gear.retired && s.gear.id !== current && <button className="mini" onClick={() => setCurrentGear(s.gear.id!)}>쓰기</button>}
                    <button className="mini" onClick={() => { const m = prompt('메모', s.gear.memo ?? ''); if (m !== null) db.gear.update(s.gear.id!, { memo: m }); }}>메모</button>
                    <button className="mini" onClick={() => { db.gear.update(s.gear.id!, { retired: !s.gear.retired }); if (s.gear.id === current) setCurrentGear(null); }}>{s.gear.retired ? '다시 쓰기' : '그만 씀'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {stats.some((s) => s.gear.retired) && <button className="link small" onClick={() => setShowRetired(!showRetired)}>{showRetired ? '그만 쓴 것 숨기기' : '그만 쓴 것도 보기'}</button>}
      {shown.some((s) => s.gear.memo) && <ul className="advice">{shown.filter((s) => s.gear.memo).map((s) => <li key={s.gear.id}><b>{s.gear.label}</b> {s.gear.memo}</li>)}</ul>}
    </div>
  );
}
