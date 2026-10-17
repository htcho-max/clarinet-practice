import { INST } from '../instruments/current';
import { FingeringDiagram } from './FingeringDiagram';
import { FluteDiagram } from './FluteDiagram';
import type { KeyId } from '../clarinet/fingerings';
import type { FluteKey } from '../flute/fingerings';

/** 지금 악기의 운지 그림. size: 클라리넷은 폭(세로 그림), 플룻은 폭(가로 그림) */
export function InstrumentDiagram({ keys, size, compact }: { keys: string[]; size: number; compact?: boolean }) {
  if (INST === 'flute') return <FluteDiagram keys={keys as FluteKey[]} size={Math.round(size * 2)} compact={compact} />;
  return <FingeringDiagram keys={keys as KeyId[]} size={size} compact={compact} />;
}
export const DIAGRAM_HORIZONTAL = INST === 'flute';
