import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type ToneRun } from '../data/db';

/** 롱톤·텅잉·넘기·따라 불기 기록 (최근 순). kind 를 빼면 모두 */
export function useToneRuns(kind?: ToneRun['kind']): ToneRun[] {
  const [rows, setRows] = useState<ToneRun[]>([]);
  useEffect(() => {
    const sub = liveQuery(() => (kind ? db.toneRuns.where('kind').equals(kind) : db.toneRuns.toCollection()).reverse().sortBy('createdAt')).subscribe({ next: setRows, error: () => {} });
    return () => sub.unsubscribe();
  }, [kind]);
  return rows;
}
