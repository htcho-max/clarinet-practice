/**
 * 지금 쓰는 악기. 악기마다 기록(데이터베이스)·설정이 따로라서, 바꾸면 앱을 다시 불러옴.
 * 브라우저 밖(테스트)에서는 클라리넷.
 */
export type InstrumentId = 'clarinet' | 'flute';
export const INSTRUMENT_IDS: InstrumentId[] = ['clarinet', 'flute'];
const KEY = 'wind-instrument';

function read(): InstrumentId {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    if (v === 'clarinet' || v === 'flute') return v;
  } catch { /* 무시 */ }
  return 'clarinet';
}

export const INST: InstrumentId = read();

export function switchInstrument(id: InstrumentId) {
  try { localStorage.setItem(KEY, id); } catch { /* 무시 */ }
  location.reload();
}
