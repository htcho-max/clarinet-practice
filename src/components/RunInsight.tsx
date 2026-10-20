import type { ScoreRun } from '../data/db';
import { runInsight, type RunNote } from '../score/practice';
import { tolFor } from '../score/tolerance';
import { midiName } from '../audio/notes';
import { useSettings } from '../state/settings';

/** 기록 한 번 요약: 맞은 음, 음정 높낮이 경향, 가장 벗어난 음, 약한 마디 (지금 판정 기준으로) */
export function RunInsightView({ run }: { run: ScoreRun }) {
  const { settings } = useSettings();
  const ins = run.notes?.length ? runInsight(run.notes as RunNote[], tolFor(settings.pitchTolerance).good + 0.001) : null;
  const pct = Math.round((run.ok / Math.max(1, run.total)) * 100);
  return (
    <div className="run-insight" data-testid="run-insight">
      <p className="small"><b>{pct}%</b> 맞은 음 {run.ok}/{run.total}{run.meanAbs !== null ? ` · 평균 ±${Math.round(run.meanAbs)}센트` : ''}{run.rhythmMs != null ? ` · 박자 ±${Math.round(run.rhythmMs)}ms` : ''}{run.bpm ? ` · 내 템포 ♩≈${run.bpm}` : ''}</p>
      {ins && (ins.sharp + ins.flat > 0) && (
        <p className="small">음정: <b className="sharp">▲ 높게 {ins.sharp}음</b> · <b className="flat">▼ 낮게 {ins.flat}음</b> · 정확 {ins.inTune}음{ins.sharp + ins.flat >= 4 ? ` — ${ins.sharp > ins.flat * 1.5 ? '전체로 높게 부는 편이에요' : ins.flat > ins.sharp * 1.5 ? '전체로 낮게 부는 편이에요' : '높고 낮음이 섞여 있어요'}` : ''}</p>
      )}
      {ins && ins.worst.length > 0 && (
        <p className="small">가장 벗어난 음: {ins.worst.map((w) => `${w.measure}마디 ${midiName(w.midi)} ${w.cents > 0 ? '▲' : '▼'}${Math.abs(w.cents)}`).join(' · ')}</p>
      )}
      {(run.wrong > 0 || run.missed > 0) && <p className="small">다른 음 {run.wrong} · 놓친 음 {run.missed}</p>}
      {run.weakMeasures?.length ? <p className="small">가장 벗어난 마디: {run.weakMeasures.join(', ')}</p> : null}
    </div>
  );
}
