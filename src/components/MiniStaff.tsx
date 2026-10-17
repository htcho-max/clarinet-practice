/** 높은음자리표 오선에 음 하나(또는 몇 개)를 그림. 악보음 midi */
const LETTERS = 'CDEFGAB';
/** midi → 철자 (클라리넷 교재식: C♯ F♯ G♯ 는 올림, E♭ B♭ 는 내림) */
export function spell(midi: number): { letter: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const map: [string, number][] = [['C', 0], ['C', 1], ['D', 0], ['E', -1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['B', -1], ['B', 0]];
  const [letter, alter] = map[pc];
  return { letter, alter, octave };
}

const GAP = 8; // 줄 간격

export function MiniStaff({ notes, width = 160, highlight }: { notes: number[]; width?: number; highlight?: number }) {
  // 높은 음(덧줄 많은 플룻 3옥타브)이 있으면 위로 늘림
  const dOfMidi = (m: number) => { const s = spell(m); return s.octave * 7 + LETTERS.indexOf(s.letter); };
  const dMax = Math.max(42, ...notes.map(dOfMidi));
  const TOP = 30 + (dMax - 42) * (GAP / 2); // 맨 윗줄(F5) y
  const lineY = (i: number) => TOP + i * GAP; // 0 = F5 ... 4 = E4
  const yOf = (d: number) => lineY(4) - (d - 30) * (GAP / 2); // E4 = d 30
  const h = 112 + (TOP - 30);
  const x0 = 44, step = Math.max(26, (width - x0 - 14) / Math.max(1, notes.length));
  return (
    <svg className="mini-staff" viewBox={`0 0 ${width} ${h}`} width={width} height={h} role="img"
      aria-label={notes.map((m) => { const s = spell(m); return `${s.letter}${s.alter > 0 ? '♯' : s.alter < 0 ? '♭' : ''}${s.octave}`; }).join(' ')}>
      {[0, 1, 2, 3, 4].map((i) => <line key={i} x1={4} x2={width - 4} y1={lineY(i)} y2={lineY(i)} className="staff-line" />)}
      <text x={6} y={lineY(4) + 9} className="clef">𝄞</text>
      {notes.map((m, i) => {
        const s = spell(m);
        const d = s.octave * 7 + LETTERS.indexOf(s.letter);
        const x = x0 + i * step + step / 2;
        const y = yOf(d);
        const ledgers: number[] = [];
        for (let L = 28; L >= d; L -= 2) ledgers.push(L); // C4 이하 덧줄
        for (let L = 40; L <= d; L += 2) ledgers.push(L); // A5 이상 덧줄
        const cls = highlight === i ? 'staff-note hl' : 'staff-note';
        return (
          <g key={i} className={cls}>
            {ledgers.map((L) => <line key={L} x1={x - 10} x2={x + 10} y1={yOf(L)} y2={yOf(L)} className="staff-line" />)}
            {s.alter !== 0 && <text x={x - 17} y={y + 5} className="acc">{s.alter > 0 ? '♯' : '♭'}</text>}
            <ellipse cx={x} cy={y} rx={5.6} ry={4.2} transform={`rotate(-20 ${x} ${y})`} />
            {d < 34 ? <line x1={x + 5} x2={x + 5} y1={y} y2={y - 26} className="stem" /> : <line x1={x - 5} x2={x - 5} y1={y} y2={y + 26} className="stem" />}
          </g>
        );
      })}
    </svg>
  );
}
