import { useEffect, useMemo, useRef, useState } from 'react';
import { FINGERINGS, fingeringFor, describeKeys } from '../clarinet/fingerings';
import { FingeringDiagram } from '../components/FingeringDiagram';
import { MiniStaff } from '../components/MiniStaff';
import { CentsGauge, centsText } from '../components/CentsGauge';
import { freqToNote, midiToFreq, prettyName, registerOf, soundingMidi, NOTE_NAMES_KO, NOTE_NAMES, INSTRUMENTS } from '../audio/notes';
import { playTone } from '../audio/tone';
import { usePitch } from '../state/usePitch';
import { useSettings } from '../state/settings';
import { useWakeLock } from '../state/wakeLock';

type Range = 'low' | 'mid' | 'high';
const RANGES: { id: Range; label: string; lo: number; hi: number }[] = [
  { id: 'low', label: '낮은 음 E3~B♭4', lo: 52, hi: 70 },
  { id: 'mid', label: '가운데 B4~C6', lo: 71, hi: 84 },
  { id: 'high', label: '높은 음 (고급)', lo: 85, hi: 91 },
];
type Mode = 'chart' | 'quiz';

const koName = (midi: number) => NOTE_NAMES_KO[NOTE_NAMES[((midi % 12) + 12) % 12]];

export function Fingering() {
  const { settings } = useSettings();
  const [range, setRange] = useState<Range>(() => { try { return (localStorage.getItem('clarinet-fg-range') as Range) || 'low'; } catch { return 'low'; } });
  const [sel, setSel] = useState(60);
  const [mode, setMode] = useState<Mode>('chart');
  const [follow, setFollow] = useState(true);
  const pitch = usePitch(settings.minDb);
  useWakeLock(pitch.on, settings.wakeLock);
  useEffect(() => { try { localStorage.setItem('clarinet-fg-range', range); } catch { /* 무시 */ } }, [range]);

  const r = RANGES.find((x) => x.id === range)!;
  const list = FINGERINGS.filter((n) => n.midi >= r.lo && n.midi <= r.hi);
  const freq = pitch.reading?.freq ?? null;
  const heard = freq ? freqToNote(freq, settings.a4) : null;
  const heardOk = heard && fingeringFor(heard.midi) ? heard : null;

  // 마이크로 들은 음을 따라가기 (0.25초 이상 같은 음)
  const stable = useRef<{ midi: number; since: number } | null>(null);
  useEffect(() => {
    if (mode !== 'chart' || !follow || !heardOk) { stable.current = null; return; }
    const now = performance.now();
    if (stable.current?.midi !== heardOk.midi) stable.current = { midi: heardOk.midi, since: now };
    else if (now - stable.current.since > 250 && sel !== heardOk.midi) {
      setSel(heardOk.midi);
      const nr = RANGES.find((x) => heardOk.midi >= x.lo && heardOk.midi <= x.hi);
      if (nr && nr.id !== range) setRange(nr.id);
    }
  }, [heardOk?.midi, pitch.reading, mode, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  const inst = INSTRUMENTS.find((i) => i.id === settings.instrument)!;

  return (
    <section className="page fingering-page">
      <div className="segmented" role="tablist">
        <button className={mode === 'chart' ? 'on' : ''} onClick={() => setMode('chart')}>운지표</button>
        <button className={mode === 'quiz' ? 'on' : ''} onClick={() => setMode('quiz')} data-testid="quiz-tab">운지 퀴즈</button>
      </div>
      <div className="segmented small">
        {RANGES.map((x) => <button key={x.id} className={range === x.id ? 'on' : ''} onClick={() => { setRange(x.id); if (sel < x.lo || sel > x.hi) setSel(x.id === 'low' ? 60 : x.lo); }}>{x.label}</button>)}
      </div>

      {mode === 'chart' ? (
        <>
          <div className="fg-grid" data-testid="fg-grid">
            {list.map((n) => (
              <button key={n.midi} className={`chip ${sel === n.midi ? 'on' : ''} ${heardOk?.midi === n.midi ? 'heard' : ''}`} onClick={() => setSel(n.midi)}>
                {prettyName(n.midi)}
              </button>
            ))}
          </div>
          <NoteCard midi={sel} a4={settings.a4} instLabel={inst.label} />
          <div className="card">
            <div className="card-head">
              <b>불어 보기</b>
              <label className="small"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> 부는 음의 운지로 바꾸기</label>
            </div>
            <div className="drone-reading">
              <span className="note-mid" data-testid="fg-heard">{heard ? prettyName(heard.midi) : '—'}</span>
              <span className="muted">{heard ? koName(heard.midi) : pitch.on ? '소리를 내 주세요' : '마이크를 켜면 부는 음을 알려줘요'}</span>
              <span className="cents-num">{centsText(heard?.cents ?? null)}<small> 센트</small></span>
            </div>
            <CentsGauge cents={heard?.cents ?? null} />
            <button className={`secondary wide ${pitch.on ? 'on' : ''}`} onClick={pitch.on ? pitch.stop : pitch.start}>{pitch.on ? '마이크 끄기' : '마이크 켜기'}</button>
            {pitch.error && <p className="error">{pitch.error}</p>}
          </div>
        </>
      ) : (
        <Quiz lo={r.lo} hi={r.hi} pitch={pitch} a4={settings.a4} />
      )}
    </section>
  );
}

function NoteCard({ midi, a4, instLabel }: { midi: number; a4: number; instLabel: string }) {
  const n = fingeringFor(midi);
  const [alt, setAlt] = useState(0);
  useEffect(() => setAlt(0), [midi]);
  if (!n) return null;
  const all = [n.main, ...n.alts];
  const cur = all[Math.min(alt, all.length - 1)];
  const reg = registerOf(midi);
  const real = soundingMidi(midi);
  return (
    <div className="card fg-card" data-testid="fg-card">
      <div className="fg-top">
        <div className="fg-info">
          <div className="note-big small-big">{prettyName(midi)}</div>
          <div className="muted">{koName(midi)} · {reg.label}</div>
          {real !== midi && <div className="muted small">{instLabel}의 실제 소리는 {prettyName(real)}</div>}
          <MiniStaff notes={[midi]} width={120} />
          <button className="secondary" onClick={() => playTone(midiToFreq(midi, a4), 1.6)}>▶ 소리 듣기</button>
        </div>
        <FingeringDiagram keys={cur.keys} size={132} />
      </div>
      {all.length > 1 && (
        <div className="segmented small">
          {all.map((x, i) => <button key={i} className={alt === i ? 'on' : ''} onClick={() => setAlt(i)}>{i === 0 ? '기본 운지' : `다른 운지 ${i}`}</button>)}
        </div>
      )}
      <p className="small fg-desc">{describeKeys(cur.keys)}{cur.note ? ` (${cur.note})` : ''}</p>
      {n.tip && alt === 0 && <p className="hint"><b>팁</b> {n.tip}</p>}
      {midi >= 85 && <p className="hint">알티시모 운지는 악기·리드마다 조금씩 달라요. 선생님과 확인하세요.</p>}
    </div>
  );
}

/** 운지 퀴즈: 오선의 음을 보고 불기. 0.4초 이상 맞는 음이 나면 정답 */
function Quiz({ lo, hi, pitch, a4 }: { lo: number; hi: number; pitch: ReturnType<typeof usePitch>; a4: number }) {
  const pool = useMemo(() => FINGERINGS.filter((n) => n.midi >= lo && n.midi <= hi).map((n) => n.midi), [lo, hi]);
  const pick = (prev?: number) => { let m = pool[Math.floor(Math.random() * pool.length)]; if (pool.length > 1) while (m === prev) m = pool[Math.floor(Math.random() * pool.length)]; return m; };
  const [target, setTarget] = useState(() => pick());
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState({ ok: 0, tries: 0, hints: 0 });
  const [flash, setFlash] = useState<string | null>(null);
  const since = useRef<number | null>(null);
  const t0 = useRef(performance.now());
  const times = useRef<number[]>([]);
  useEffect(() => { setTarget(pick()); setHint(false); }, [lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const freq = pitch.reading?.freq ?? null;
  const heard = freq ? freqToNote(freq, a4) : null;
  useEffect(() => {
    if (!heard || flash) { since.current = null; return; }
    if (heard.midi !== target) { since.current = null; return; }
    const now = performance.now();
    if (since.current === null) since.current = now;
    else if (now - since.current > 400) {
      times.current.push((now - t0.current) / 1000);
      setScore((s) => ({ ok: s.ok + 1, tries: s.tries + 1, hints: s.hints + (hint ? 1 : 0) }));
      setFlash(`정답! ${prettyName(target)}`);
      setTimeout(() => { setFlash(null); setHint(false); setTarget((t) => pick(t)); t0.current = performance.now(); since.current = null; }, 900);
    }
  }, [pitch.reading]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = fingeringFor(target)!;
  const avg = times.current.length ? times.current.reduce((a, b) => a + b, 0) / times.current.length : null;
  return (
    <>
      <div className={`card quiz ${flash ? 'quiz-ok' : ''}`} data-testid="quiz-card">
        <p className="hint">오선의 음을 보고 불어 보세요. 맞는 음이 0.4초 이상 나면 다음 문제로 넘어가요.</p>
        <div className="quiz-staff"><MiniStaff notes={[target]} width={150} /></div>
        <div className="quiz-status">{flash ?? (heard ? `지금 ${prettyName(heard.midi)}` : pitch.on ? '소리를 내 주세요' : '')}</div>
        {hint && (
          <div className="fg-top">
            <div className="fg-info"><div className="note-big small-big">{prettyName(target)}</div><div className="muted">{koName(target)}</div></div>
            <FingeringDiagram keys={n.main.keys} size={110} compact />
          </div>
        )}
        <div className="session-controls">
          <button onClick={() => setHint(true)} disabled={hint}>힌트 (운지 보기)</button>
          <button onClick={() => playTone(midiToFreq(target, a4), 1.4)}>▶ 소리</button>
          <button onClick={() => { setScore((s) => ({ ...s, tries: s.tries + 1 })); setHint(false); setTarget((t) => pick(t)); t0.current = performance.now(); }}>건너뛰기</button>
        </div>
        {!pitch.on && <button className="primary wide" onClick={pitch.start}>마이크 켜고 시작</button>}
        {pitch.error && <p className="error">{pitch.error}</p>}
      </div>
      <div className="stats">
        <div><b>{score.ok}</b><span>맞힘</span></div>
        <div><b>{score.tries - score.ok}</b><span>건너뜀</span></div>
        <div><b>{avg === null ? '—' : `${avg.toFixed(1)}초`}</b><span>평균 걸린 시간</span></div>
      </div>
    </>
  );
}
