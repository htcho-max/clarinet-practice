import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { db, type Piece } from '../data/db';

/** 클라리넷 앱은 곡 목록을 비워 두고 시작 (쉬운 곡은 연습곡에 있음) */
export function seedPieces(): Promise<void> { return Promise.resolve(); }

export function usePieces(): Piece[] {
  const [rows, setRows] = useState<Piece[]>([]);
  useEffect(() => {
    seedPieces();
    const sub = liveQuery(() => db.pieces.toArray()).subscribe({
      next: (ps) => setRows(ps.sort((a, b) => a.book - b.book || (a.order ?? 0) - (b.order ?? 0))),
      error: () => {},
    });
    return () => sub.unsubscribe();
  }, []);
  return rows;
}

export const updatePiece = (id: string, patch: Partial<Piece>) => db.pieces.update(id, patch);
