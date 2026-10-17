import { useEffect, useRef, useState } from 'react';
import { CentsGauge, centsText } from '../components/CentsGauge';
import { InstrumentDiagram } from '../components/InstrumentDiagram';
import { usePitch } from '../state/usePitch';
import { useSettings } from '../state/settings';
import { useWakeLock } from '../state/wakeLock';
import { NOTE_NAMES, NOTE_NAMES_KO, INSTRUMENTS, centsBetween, freqToNote, midiToFreq, prettyName, soundingMidi, toSounding } from '../audio/notes';
import { P, fingeringFor } from '../instruments/profiles';
import { playTone } from '../audio/tone';

type Mode = 'auto' | 'tune';

/** 조율할 때 많이 쓰는 음 (악보음). 실음 B♭(합주 기준음)은 악보 C */
const TUNE_NOTES = P.tuneNotes;

const koName = (midi: number) => NOTE_NAMES_KO[NOTE_NAMES[((midi % 12) + 12) % 12]];

export function Tuner() {
  const { settings, update } = useSettings();
  const { reading, on, error, start, stop } = usePitch(settings.minDb);
  const [mode, setMode] = useState<Mode>('auto');
  const [target, setTarget] = useState(TUNE_NOTES[0]);
  const [refOn, setRefOn] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  useWakeLock(on || refOn, settings.wakeLock);
  // 조율 모드: 최근 1.5초 평균 (리드 소리는 흔들려서 평균으로 판단)
  const hist = useRef<{ t: number; c: number }[]>([]);

  const a4 = settings.a4;
  const freq = reading?.freq ?? null;
  const note = freq ? freqToNote(freq, a4) : null;
  const inst = INSTRUMENTS.find((i) => i.id === settings.instrument) ?? INSTRUMENTS[3];

  let cents: number | null = null;
  let mainLabel = '—';
  let subLabel = on ? '소리를 내 주세요' : '마이크를 켜 주세요';
  if (mode === 'auto' && note) {
    cents = note.cents;
    mainLabel = prettyName(note.midi);
    subLabel = `${koName(note.midi)} · ${P.registerOf(note.midi).label}`;
  } else if (mode === 'tune') {
    mainLabel = target.label;
    subLabel = target.why;
    if (freq) {
      const c = centsBetween(freq, midiToFreq(target.midi, a4));
      cents = Math.abs(c) <= 150 ? c : null; // 다른 음은 무시
    }
  }
  useEffect(() => {
    if (mode !== 'tune' || cents === null) return;
    const t = performance.now() / 1000;
    hist.current.push({ t, c: cents });
    hist.current = hist.current.filter((h) => t - h.t < 1.5);
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  const avg = mode === 'tune' && hist.current.length >= 10 && cents !== null ? hist.current.reduce((a, h) => a + h.c, 0) / hist.current.length : null;
  const tight = cents !== null && Math.abs(cents) <= 5;
  const fing = mode === 'auto' && note ? fingeringFor(note.midi) : mode === 'tune' ? fingeringFor(target.midi) : undefined;

  const stopRef0 = () => { stopRef.current?.(); stopRef.current = null; setRefOn(false); };
  useEffect(() => () => { stopRef.current?.(); }, []);

  async function pickTarget(t: typeof TUNE_NOTES[number]) {
    setTarget(t);
    hist.current = [];
    if (refOn) { stopRef.current?.(); stopRef.current = await playTone(midiToFreq(t.midi, a4)); }
  }
  async function toggleRef() {
    if (refOn) return stopRef0();
    stopRef.current = await playTone(midiToFreq(target.midi, a4));
    setRefOn(true);
  }

  return (
    <section className="page tuner">
      <div className="segmented">
        <button className={mode === 'auto' ? 'on' : ''} onClick={() => { setMode('auto'); stopRef0(); }}>자동</button>
        <button className={mode === 'tune' ? 'on' : ''} onClick={() => setMode('tune')} data-testid="tune-mode">조율하기</button>
      </div>

      <div className={`tuner-display ${tight ? 'in-tune' : ''}`}>
        <div className="note-big" data-testid="note">{mainLabel}</div>
        <div className="note-sub">{subLabel}</div>
        <div className="cents-num" data-testid="cents">{centsText(cents)}<small> 센트</small></div>
        <CentsGauge cents={cents} />
        <div className="freq">
          {freq && note ? `실음 ${prettyName(soundingMidi(note.midi))} · ${toSounding(freq).toFixed(1)} Hz` : ' '}
        </div>
      </div>

      {mode === 'tune' && (
        <>
          <div className="chips">
            {TUNE_NOTES.map((t) => (
              <button key={t.midi} className={`chip ${target.midi === t.midi ? 'on' : ''}`} onClick={() => pickTarget(t)}>{t.label}</button>
            ))}
          </div>
          <div className="card" data-testid="tune-advice">
            <b>{P.tuneTitle}</b>
            <p className="small tune-advice">
              {avg === null ? '편한 세기로 2초쯤 길게 불어 보세요. 입술을 조이거나 풀지 말고 평소대로.'
                : Math.abs(avg) <= 5 ? `맞아요 (평균 ${centsText(avg)}). 그대로 두세요.`
                  : avg > 0 ? `평균 ${centsText(avg)} — ${P.tuneSharp}`
                    : `평균 ${centsText(avg)} — ${P.tuneFlat}`}
            </p>
            <p className="hint">{P.tuneHint}</p>
            <button className={`wide ${refOn ? 'secondary on' : 'secondary'}`} onClick={toggleRef}>
              {refOn ? `■ ${target.label} 기준음 끄기` : `▶ ${target.label} 기준음 계속 듣기`}
            </button>
          </div>
        </>
      )}

      {fing && (
        <div className="card tuner-fing">
          <InstrumentDiagram keys={fing.main.keys} size={86} compact />
          <div>
            <b>{prettyName(fing.midi)} 운지</b>
            <p className="muted small">운지 탭에서 다른 운지와 팁을 볼 수 있어요.</p>
          </div>
        </div>
      )}

      <button className={`primary wide ${on ? 'stop' : ''}`} onClick={on ? stop : start} data-testid="mic">
        {on ? '마이크 끄기' : '마이크 켜기'}
      </button>
      {error && <p className="error">{error}</p>}

      {P.transposeChoices.length > 1 && <div className="row-setting">
        <span>조</span>
        <select value={settings.instrument} onChange={(e) => update({ instrument: e.target.value as typeof settings.instrument })} aria-label="조 (이조)">
          {INSTRUMENTS.filter((i) => P.transposeChoices.includes(i.id)).map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
        <span className="muted small">{inst.semis ? '음 이름은 악보음으로 보여줘요' : '실제 소리 그대로'}</span>
      </div>}
      <div className="row-setting">
        <span>기준 A</span>
        <button className="mini" onClick={() => update({ a4: Math.max(438, a4 - 1) })}>−</button>
        <b>{a4} Hz</b>
        <button className="mini" onClick={() => update({ a4: Math.min(445, a4 + 1) })}>＋</button>
        <span className="muted small">(실음 A4)</span>
      </div>
    </section>
  );
}
