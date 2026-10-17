import type { KeyId } from '../clarinet/fingerings';
import { KEY_LABEL } from '../clarinet/fingerings';

/**
 * 클라리넷(뷔페 B12, 17키 6링) 앞모습 운지 그림 (위가 마우스피스 쪽). 누르는 키·막는 구멍을 칠함.
 * 엄지 구멍과 레지스터 키는 악기 뒤에 있어서 왼쪽에 따로 그림.
 */
type Shape =
  | { t: 'hole'; x: number; y: number; r: number }
  | { t: 'key'; x: number; y: number; w: number; h: number; rot?: number };

const S: Record<KeyId, Shape> = {
  reg: { t: 'key', x: 16, y: 34, w: 9, h: 18 },
  thumb: { t: 'hole', x: 16, y: 60, r: 6.5 },
  a: { t: 'key', x: 60, y: 18, w: 18, h: 7, rot: -8 },
  gs: { t: 'key', x: 78, y: 32, w: 7, h: 15, rot: 10 },
  l1: { t: 'hole', x: 60, y: 46, r: 9 },
  l2: { t: 'hole', x: 60, y: 72, r: 9 },
  l3: { t: 'hole', x: 60, y: 98, r: 9 },
  lEbSide: { t: 'key', x: 77, y: 85, w: 12, h: 4.5 },
  csgs: { t: 'key', x: 83, y: 113, w: 7, h: 13 },
  lFC: { t: 'key', x: 98, y: 121, w: 13, h: 7 },
  lEB: { t: 'key', x: 88, y: 136, w: 11, h: 9 },
  lFs: { t: 'key', x: 102, y: 136, w: 11, h: 9 },
  t1: { t: 'key', x: 39, y: 60, w: 11, h: 5 },
  t2: { t: 'key', x: 39, y: 68, w: 11, h: 5 },
  t3: { t: 'key', x: 39, y: 76, w: 11, h: 5 },
  t4: { t: 'key', x: 39, y: 84, w: 11, h: 5 },
  r1: { t: 'hole', x: 60, y: 146, r: 9 },
  r2: { t: 'hole', x: 60, y: 172, r: 9 },
  r3: { t: 'hole', x: 60, y: 198, r: 9 },
  sliver: { t: 'key', x: 44, y: 160, w: 4.5, h: 13 },
  rAb: { t: 'key', x: 54, y: 222, w: 12, h: 8 },
  rFs: { t: 'key', x: 70, y: 222, w: 12, h: 8 },
  rFC: { t: 'key', x: 54, y: 234, w: 12, h: 8 },
  rEB: { t: 'key', x: 70, y: 234, w: 12, h: 8 },
};

export const ALL_KEYS = Object.keys(S) as KeyId[];

export function FingeringDiagram({ keys, size = 150, compact = false, label }: { keys: KeyId[]; size?: number; compact?: boolean; label?: string }) {
  const on = new Set(keys);
  const h = size * (252 / 120);
  return (
    <svg className="fingering" viewBox="0 0 120 252" width={size} height={h} role="img" aria-label={label ?? `운지: ${keys.map((k) => KEY_LABEL[k]).join(', ') || '열린 음'}`}>
      {/* 몸통 */}
      <rect x={50} y={4} width={20} height={240} rx={6} className="fg-body" />
      <line x1={44} y1={122} x2={76} y2={122} className="fg-divider" />
      {/* 뒤쪽 (엄지) */}
      <rect x={6} y={24} width={20} height={46} rx={6} className="fg-back" />
      {!compact && <text x={16} y={82} className="fg-text" textAnchor="middle">뒤</text>}
      {!compact && <text x={104} y={56} className="fg-text" textAnchor="middle">왼손</text>}
      {!compact && <text x={104} y={180} className="fg-text" textAnchor="middle">오른손</text>}
      {(Object.entries(S) as [KeyId, Shape][]).map(([id, s]) => {
        const cls = on.has(id) ? 'fg-on' : 'fg-off';
        if (s.t === 'hole') {
          return (
            <g key={id} data-key={id} className={cls}>
              <circle cx={s.x} cy={s.y} r={s.r} className="fg-hole" />
              <circle cx={s.x} cy={s.y} r={s.r + 2.2} className="fg-ring" />
            </g>
          );
        }
        return (
          <rect key={id} data-key={id} className={`${cls} fg-key`} x={s.x - s.w / 2} y={s.y - s.h / 2} width={s.w} height={s.h} rx={Math.min(s.w, s.h) / 2.2}
            transform={s.rot ? `rotate(${s.rot} ${s.x} ${s.y})` : undefined} />
        );
      })}
    </svg>
  );
}
