import { FLUTE_KEY_LABEL, type FluteKey } from '../flute/fingerings';

/**
 * 플룻(야마하 YFL-222: 커버드 키, 오프셋 G, C 풋) 운지 그림. 연주자가 보는 쪽에서 가로로,
 * 왼쪽이 헤드조인트 쪽. 엄지 키는 몸통 아래에, 오프셋 G(왼손 약지)는 살짝 앞으로 나와 있음.
 */
type Shape = { t: 'hole'; x: number; y: number; r: number } | { t: 'key'; x: number; y: number; w: number; h: number };

const S: Record<FluteKey, Shape> = {
  thumbBb: { t: 'key', x: 34, y: 52, w: 7, h: 11 },
  thumbB: { t: 'key', x: 44, y: 54, w: 9, h: 13 },
  l1: { t: 'hole', x: 44, y: 28, r: 8.5 },
  l2: { t: 'hole', x: 68, y: 28, r: 8.5 },
  l3: { t: 'hole', x: 93, y: 33, r: 8.5 },
  gs: { t: 'key', x: 112, y: 46, w: 12, h: 6 },
  r1: { t: 'hole', x: 140, y: 28, r: 8.5 },
  trD: { t: 'key', x: 152, y: 11, w: 6, h: 9 },
  r2: { t: 'hole', x: 164, y: 28, r: 8.5 },
  trDs: { t: 'key', x: 176, y: 11, w: 6, h: 9 },
  r3: { t: 'hole', x: 188, y: 28, r: 8.5 },
  eb: { t: 'key', x: 210, y: 46, w: 13, h: 7 },
  cs: { t: 'key', x: 232, y: 45, w: 8, h: 12 },
  c: { t: 'key', x: 244, y: 45, w: 8, h: 12 },
};
export const FLUTE_DIAGRAM_KEYS = Object.keys(S) as FluteKey[];

export function FluteDiagram({ keys, size = 260, compact = false, label }: { keys: FluteKey[]; size?: number; compact?: boolean; label?: string }) {
  const on = new Set(keys);
  return (
    <svg className="fingering flute" viewBox="0 0 260 72" width={size} height={(size * 72) / 260} role="img"
      aria-label={label ?? `운지: ${keys.map((k) => FLUTE_KEY_LABEL[k]).join(', ') || '모두 열기'}`}>
      <rect x={4} y={20} width={252} height={16} rx={6} className="fg-body" />
      <line x1={118} y1={14} x2={118} y2={44} className="fg-divider" />
      {!compact && <text x={68} y={70} className="fg-text" textAnchor="middle">왼손</text>}
      {!compact && <text x={164} y={70} className="fg-text" textAnchor="middle">오른손</text>}
      {(Object.entries(S) as [FluteKey, Shape][]).map(([id, s]) => {
        const cls = on.has(id) ? 'fg-on' : 'fg-off';
        if (s.t === 'hole') {
          return (
            <g key={id} data-key={id} className={cls}>
              <circle cx={s.x} cy={s.y} r={s.r} className="fg-hole" />
            </g>
          );
        }
        return <rect key={id} data-key={id} className={`${cls} fg-key`} x={s.x - s.w / 2} y={s.y - s.h / 2} width={s.w} height={s.h} rx={Math.min(s.w, s.h) / 2.2} />;
      })}
    </svg>
  );
}
