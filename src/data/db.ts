import { P } from '../instruments/profiles';
import Dexie, { type Table } from 'dexie';

export interface SessionItem { key: string; label: string; sec: number; pieceId?: string }
export interface Session {
  id?: number;
  date: string; // YYYY-MM-DD (현지 날짜)
  startedAt: number;
  totalSec: number;
  items: SessionItem[];
  memo?: string;
}
export type PieceStatus = 'learning' | 'tempo' | 'done' | 'review';
export interface Piece {
  id: string;
  book: number;
  title: string;
  key: string;
  status: PieceStatus;
  targetBpm?: number;
  currentBpm?: number;
  lastPracticed?: string;
  memo?: string;
  order?: number;
}

/** 템포 트레이너 한 번의 기록 */
export interface Ladder {
  id?: number;
  date: string;
  startedAt: number;
  pieceId?: string;
  startBpm: number;
  targetBpm: number;
  reachedBpm: number;
  steps: { bpm: number; at: number }[];
}

/** 녹음 + 음정 곡선 */
export interface Recording {
  id?: number;
  createdAt: number;
  date: string;
  pieceId?: string;
  title: string;
  durationSec: number;
  mime: string;
  blob: Blob;
  /** [초, 센트(평균율 기준), midi] 를 0.05초 간격으로 */
  track: [number, number | null, number | null][];
  /** 악보 채점과 함께 녹음한 경우 */
  scoreId?: number;
  runId?: number;
}

/** 악보 연습(채점) 한 번의 기록 */
export interface ScoreRun {
  id?: number;
  createdAt: number;
  date: string;
  scoreId: number;
  title: string;
  pieceId?: string;
  /** 연습곡이면 단계 id */
  exerciseId?: string;
  from: number;
  to: number;
  durationSec: number;
  total: number;
  ok: number;
  wrong: number;
  missed: number;
  meanAbs: number | null;
  /** 박자 오차(ms)와 내 템포 */
  rhythmMs?: number | null;
  bpm?: number | null;
  /** 진행 중인 연습 세션 안에서 했는지 (그러면 시간은 세션에 이미 들어 있음) */
  inSession: boolean;
  recordingId?: number;
  /** 가장 벗어난 마디 몇 개 */
  weakMeasures?: number[];
  /** 음별 음정 [악보음 midi, 센트 합(부호 있음), 음 수] — 음정 습관 지도 */
  noteCents?: [number, number, number][];
  /** 템포 사다리로 채점했을 때 목표 템포 */
  ladderBpm?: number;
  /** 그때 쓴 리드(플룻은 헤드조인트 위치) */
  gearId?: number;
}
/** 롱톤·텅잉 한 번의 기록 */
export interface ToneRun {
  id?: number;
  createdAt: number;
  date: string;
  kind: 'long' | 'tongue' | 'break' | 'echo';
  /** 그때 쓴 리드(플룻은 헤드조인트 위치) */
  gearId?: number;
  /** 넘기: 위 음, 넘은 횟수는 hits, 깨끗하게 넘은 횟수는 expected 대신 clean */
  midi2?: number;
  gapMs?: number | null;
  squeaks?: number;
  clean?: number;
  /** 따라 불기: 악구 길이·음 묶음 */
  phraseLen?: number;
  pool?: string;
  /** 롱톤 */
  midi?: number;
  pattern?: 'steady' | 'swell';
  durationSec?: number;
  meanCents?: number;
  centsSD?: number;
  dbSD?: number;
  dbRange?: number;
  centsPerDb?: number | null;
  /** 텅잉 */
  bpm?: number;
  perBeat?: number;
  hits?: number;
  expected?: number;
  meanAbsMs?: number | null;
  evenPct?: number | null;
}
export interface KV { key: string; value: unknown }

/** 복습함: 채점에서 틀린 마디. box 가 오를수록 간격이 길어지고, 끝까지 가면 졸업 */
export interface ReviewItem {
  /** `${scoreId}:${measure}` */
  id: string;
  scoreId: number;
  measure: number;
  title: string;
  box: number;
  /** 다음 복습 날 (YYYY-MM-DD) */
  due: string;
  added: string;
  last?: string;
  lastPct?: number;
  lastCents?: number | null;
}

/** 리드 (플룻은 헤드조인트 위치) */
export interface Gear {
  id?: number;
  label: string;
  /** 클라리넷: 회사·세기 (예 "반도린 2.5") / 플룻: 뺀 길이 mm */
  detail?: string;
  memo?: string;
  createdAt: number;
  retired?: boolean;
}

/** 사용자가 직접 불러온 악보 (이 기기에만 저장, 앱·저장소에는 포함하지 않음) */
export interface ScoreFile {
  id?: number;
  title: string;
  xml: string;
  pieceId?: string;
  createdAt: number;
  lastFrom?: number;
  lastTo?: number;
  /** 여러 파트 악보에서 내 파트 (0부터) */
  part?: number;
  /** 다른 파트도 악보에 보이기 */
  showOthers?: boolean;
  /** 따로 붙인 반주 악보 (MusicXML) */
  accXml?: string;
  accName?: string;
  /** 폴더 id (없으면 분류 안 됨) */
  folder?: string;
  /** 앱이 만든 연습곡 (음계·브레이크·에튀드·쉬운 곡) */
  exercise?: ExerciseMeta;
  /** 템포 사다리: 지금 목표 템포, 통과한 가장 빠른 템포 */
  ladder?: { bpm: number; best: number; at: number };
}
export interface ExerciseMeta { stepId: string; spec: import('../exercise/curriculum').ExerciseSpec; seed: number; breakKeys: string[]; tip?: string; tempo: number; progressId?: string }
export interface ExerciseProgress { best: number; mean: number | null; passed: boolean; at: number; bpm?: number; tries: number }

class PracticeDB extends Dexie {
  sessions!: Table<Session, number>;
  pieces!: Table<Piece, string>;
  kv!: Table<KV, string>;
  ladders!: Table<Ladder, number>;
  recordings!: Table<Recording, number>;
  scores!: Table<ScoreFile, number>;
  scoreRuns!: Table<ScoreRun, number>;
  toneRuns!: Table<ToneRun, number>;
  reviews!: Table<ReviewItem, string>;
  gear!: Table<Gear, number>;
  constructor() {
    super(P.dbName);
    this.version(1).stores({
      sessions: '++id, date, startedAt',
      pieces: 'id, book, status',
      kv: 'key',
    });
    this.version(2).stores({
      ladders: '++id, date, pieceId',
      recordings: '++id, createdAt, pieceId',
    });
    this.version(3).stores({ scores: '++id, createdAt, pieceId' });
    this.version(4).stores({ scoreRuns: '++id, date, scoreId, createdAt' });
    this.version(5).stores({ toneRuns: '++id, date, kind, createdAt' });
    // 연습곡 단계로 바로 찾기 (악보 XML 을 모두 읽지 않게)
    this.version(6).stores({ scores: '++id, createdAt, pieceId, exercise.stepId' });
    this.version(7).stores({ reviews: 'id, due, scoreId', gear: '++id, createdAt' });
  }
}

export const db = new PracticeDB();
