import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type Gear, type ReviewItem } from '../data/db';
import { P } from '../instruments/profiles';

const KEY = 'gear-current';

/** 지금 쓰는 리드(플룻은 헤드조인트 위치) id */
export async function currentGearId(): Promise<number | undefined> {
  try {
    const v = (await db.kv.get(KEY))?.value;
    if (typeof v !== 'number') return undefined;
    const g = await db.gear.get(v);
    return g && !g.retired ? v : undefined;
  } catch { return undefined; }
}
export const setCurrentGear = (id: number | null) => (id === null ? db.kv.delete(KEY) : db.kv.put({ key: KEY, value: id }));

export const GEAR = P.id === 'flute'
  ? { name: '헤드조인트 위치', one: '위치', detail: '뺀 길이 (mm)', example: '예: 3', labelExample: '예: 여름 · 3mm', none: '기록 안 함' }
  : { name: '리드', one: '리드', detail: '회사 · 세기', example: '예: 반도린 2.5', labelExample: '예: #1', none: '기록 안 함' };

export function useGear(): { list: Gear[]; current: number | undefined } {
  const [list, setList] = useState<Gear[]>([]);
  const [current, setCurrent] = useState<number | undefined>(undefined);
  useEffect(() => {
    const a = liveQuery(() => db.gear.orderBy('createdAt').toArray()).subscribe({ next: setList, error: () => {} });
    const b = liveQuery(() => currentGearId()).subscribe({ next: setCurrent, error: () => {} });
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, []);
  return { list, current };
}

export async function addGear(label: string, detail?: string): Promise<number> {
  const id = await db.gear.add({ label: label.trim() || '새 리드', detail: detail?.trim() || undefined, createdAt: Date.now() });
  await setCurrentGear(id);
  return id;
}

export function useReviews(scoreId?: number): ReviewItem[] {
  const [rows, setRows] = useState<ReviewItem[]>([]);
  useEffect(() => {
    const q = () => (scoreId === undefined ? db.reviews.toArray() : db.reviews.where('scoreId').equals(scoreId).toArray());
    const sub = liveQuery(q).subscribe({ next: setRows, error: () => {} });
    return () => sub.unsubscribe();
  }, [scoreId]);
  return rows;
}
