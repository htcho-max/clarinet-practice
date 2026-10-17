import type { Piece, PieceStatus } from './db';

export const STATUS_LABEL: Record<PieceStatus, string> = {
  learning: '익히는 중',
  tempo: '템포 올리는 중',
  done: '완성',
  review: '복습',
};
export const STATUS_ORDER: PieceStatus[] = ['learning', 'tempo', 'done', 'review'];

/** 곡 분류 (Piece.book 값). 예전 앱의 "권" 자리를 클라리넷에서는 분류로 씀 */
export const BOOKS: { id: number; label: string }[] = [
  { id: 1, label: '교재 곡' },
  { id: 2, label: '레슨 곡' },
  { id: 3, label: '합주 곡' },
  { id: 4, label: '좋아하는 곡' },
];
export const bookLabel = (n: number) => BOOKS.find((b) => b.id === n)?.label ?? '기타';

/** 오늘의 복습 곡: 완성/복습 곡 중 가장 오래 안 친 곡부터 n개 */
export function pickReview(pieces: Piece[], n = 2): Piece[] {
  return pieces
    .filter((p) => p.status === 'done' || p.status === 'review')
    .sort((a, b) => (a.lastPracticed ?? '').localeCompare(b.lastPracticed ?? '') || a.book - b.book || (a.order ?? 0) - (b.order ?? 0))
    .slice(0, n);
}

/** 지금 연습 중인 곡: 익히는 중/템포 올리는 중, 최근 연습한 곡 먼저 */
export function currentPieces(pieces: Piece[]): Piece[] {
  return pieces
    .filter((p) => p.status === 'learning' || p.status === 'tempo')
    .sort((a, b) => (b.lastPracticed ?? '').localeCompare(a.lastPracticed ?? '') || a.book - b.book || (a.order ?? 0) - (b.order ?? 0));
}

export function daysAgo(date: string | undefined, today: string): number | null {
  if (!date) return null;
  const d = (s: string) => { const [y, m, dd] = s.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
  return Math.round((d(today) - d(date)) / 864e5);
}
