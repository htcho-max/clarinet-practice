import { NumField } from '../components/NumField';
import { DraftInput } from '../components/DraftInput';
import { useState } from 'react';
import { db, type Piece, type PieceStatus } from '../data/db';
import { BOOKS, bookLabel, STATUS_LABEL, STATUS_ORDER, daysAgo } from '../data/pieces';
import { usePieces, updatePiece } from '../state/usePieces';
import { localDate } from '../data/dates';

function PieceRow({ p, today }: { p: Piece; today: string }) {
  const [open, setOpen] = useState(false);
  const ago = daysAgo(p.lastPracticed, today);
  return (
    <li className={`piece ${open ? 'open' : ''}`}>
      <button className="piece-head link" onClick={() => setOpen(!open)}>
        <span className="piece-title">{p.title}</span>
        <span className={`status st-${p.status}`}>{STATUS_LABEL[p.status]}</span>
        <span className="muted small">
          {p.currentBpm ? `♩${p.currentBpm}${p.targetBpm ? `/${p.targetBpm}` : ''} · ` : ''}
          {ago === null ? '기록 없음' : ago === 0 ? '오늘' : `${ago}일 전`}
        </span>
      </button>
      {open && (
        <div className="piece-edit">
          <div className="chips">
            {STATUS_ORDER.map((s) => (
              <button key={s} className={p.status === s ? 'chip on' : 'chip'} onClick={() => updatePiece(p.id, { status: s })}>{STATUS_LABEL[s]}</button>
            ))}
          </div>
          <div className="row-setting">
            <span>현재 ♩</span>
            <NumField value={p.currentBpm ?? 60} min={30} max={250} step={2} width={52} label="현재 BPM" onChange={(v) => updatePiece(p.id, { currentBpm: v })} />
          </div>
          <div className="row-setting">
            <span>목표 ♩</span>
            <NumField value={p.targetBpm ?? 100} min={30} max={250} step={2} width={52} label="목표 BPM" onChange={(v) => updatePiece(p.id, { targetBpm: v })} />
          </div>
          <div className="row-setting">
            <DraftInput className="text" value={p.title} onCommit={(v) => { if (v.trim()) updatePiece(p.id, { title: v.trim() }); }} label="곡 이름" />
            <select value={p.book} onChange={(e) => updatePiece(p.id, { book: Number(e.target.value) })} aria-label="분류">
            {BOOKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          </div>
          <div className="row-setting">
          <select value={p.key} onChange={(e) => updatePiece(p.id, { key: e.target.value })} aria-label="조성">
              <option value="">조성 (악보음)</option>{['C', 'F', 'G', 'D', 'Bb', 'Am', 'Dm', 'Gm'].map((k) => <option key={k} value={k}>{k.replace('b', '♭').replace(/m$/, '단조').replace(/^([A-G]♭?)$/, '$1장조')}</option>)}
            </select>
          </div>
          <DraftInput multiline placeholder="메모 (어려운 마디, 운지 등)" value={p.memo ?? ''} onCommit={(v) => updatePiece(p.id, { memo: v })} label="메모" />
          <div className="session-controls">
            <button onClick={() => updatePiece(p.id, { lastPracticed: today })}>오늘 연습함</button>
            <button className="danger" onClick={() => { if (confirm(`"${p.title}"을(를) 목록에서 지울까요?`)) db.pieces.delete(p.id); }}>지우기</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function Pieces() {
  const pieces = usePieces();
  const today = localDate();
  const [title, setTitle] = useState('');
  const [book, setBook] = useState(1);
  const [filter, setFilter] = useState<PieceStatus | 'all'>('all');
  const books = [...new Set(pieces.map((p) => p.book))].sort((a, b) => a - b);
  const shown = pieces.filter((p) => filter === 'all' || p.status === filter);

  async function add() {
    if (!title.trim()) return;
    const order = Math.max(0, ...pieces.filter((p) => p.book === book).map((p) => p.order ?? 0)) + 1;
    await db.pieces.add({ id: `u-${Date.now()}`, book, title: title.trim(), key: '', status: 'learning', order });
    setTitle('');
  }

  return (
    <div className="page-sub">
      <div className="chips">
        <button className={filter === 'all' ? 'chip on' : 'chip'} onClick={() => setFilter('all')}>전체 {pieces.length}</button>
        {STATUS_ORDER.map((s) => {
          const n = pieces.filter((p) => p.status === s).length;
          return n ? <button key={s} className={filter === s ? 'chip on' : 'chip'} onClick={() => setFilter(s)}>{STATUS_LABEL[s]} {n}</button> : null;
        })}
      </div>
      {books.map((b) => {
        const list = shown.filter((p) => p.book === b);
        if (!list.length) return null;
        return (
          <div key={b} className="card">
            <b>{bookLabel(b)}</b>
            <ul className="piece-list">{list.map((p) => <PieceRow key={p.id} p={p} today={today} />)}</ul>
          </div>
        );
      })}
      <div className="card">
        <b>곡 추가</b>
        <div className="row-setting">
          <select value={book} onChange={(e) => setBook(Number(e.target.value))} aria-label="분류">
            {BOOKS.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <input className="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="곡 이름" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="mini" onClick={add}>추가</button>
        </div>
        {pieces.length === 0 && <p className="hint">레슨 교재나 합주에서 연습하는 곡을 추가해 두면 오늘 화면에 "연습 중인 곡"과 "복습 곡"으로 보여줘요. 입문용 쉬운 곡은 악보 탭 → 연습곡에 들어 있어요.</p>}
        <p className="hint">상태를 "완성"이나 "복습"으로 바꾸면 오래 안 친 곡부터 복습 곡으로 추천해요.</p>
      </div>
    </div>
  );
}
