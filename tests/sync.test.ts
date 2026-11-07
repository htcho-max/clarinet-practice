/**
 * 기기 간 동기화 (바이올린 앱과 같은 서버를 같이 씀): 두 "기기"가 같은 가짜 서버(진짜 Worker 코드 + sqlite)와 주고받기
 */
import { describe, expect, it, vi } from 'vitest';
import { hasSqlite } from './helpers/fakeD1';
import { device, on, server, maxSeq, xml, URL_, KEY } from './helpers/syncDevices';

const sqliteOk = await hasSqlite();
const tick = () => new Promise((r) => setTimeout(r, 5));
const session = (sec: number) => ({ date: '2026-10-05', startedAt: sec, totalSec: sec, items: [] });

describe.skipIf(!sqliteOk)('기기 간 동기화', () => {
  it('두 기기: 처음 켜기(id 정리·합치기) → 고치기·지우기 → 메아리 없음', async () => {
    const env = await server();
    const A = await device();
    const a = await on(A, async () => {
      const gear = await A.db.gear.add({ label: '반도린 2.5', createdAt: 10 });
      await A.db.kv.put({ key: 'gear-current', value: gear });
      const sid = await A.db.scores.add({ title: '트로이메라이', xml: xml('트로이메라이'), createdAt: 1000, accXml: xml('반주') });
      await A.db.scoreRuns.add({ createdAt: 2000, date: '2026-10-01', scoreId: sid, title: '트로이메라이', from: 1, to: 9, durationSec: 60, total: 10, ok: 9, wrong: 1, missed: 0, meanAbs: 5, inSession: false, gearId: gear });
      await A.db.toneRuns.add({ createdAt: 2100, date: '2026-10-01', kind: 'long', midi: 67, durationSec: 8, gearId: gear });
      await A.db.reviews.put({ id: `${sid}:3`, scoreId: sid, measure: 3, title: '트로이메라이', box: 1, due: '2026-10-02', added: '2026-10-01' });
      await A.db.kv.put({ key: 'settings', value: { a4: 442, latencyMs: 120, minDb: -45, perfMode: 'full' } });
      await A.db.pieces.put({ id: 'p1', book: 1, title: '곡', key: 'F', status: 'tempo' });
      await A.db.lessonNotes.add({ createdAt: 3000, date: '2026-10-01', scoreId: sid, text: '숨 길게', done: false });
      return { sid, gear };
    });
    expect(a.sid).toBe(1);
    await on(A, () => A.eng.enableSync(URL_, KEY));
    expect(A.eng.getStatus().state).toBe('idle');
    const gid = (await on(A, () => A.db.scores.toArray()))[0].id!;
    const ggid = (await on(A, () => A.db.gear.toArray()))[0].id!;
    expect(gid).toBeGreaterThan(1e12);
    expect(ggid).toBeGreaterThan(1e12);
    // 가리키는 곳도 새 id
    expect((await on(A, () => A.db.scoreRuns.toArray()))[0]).toMatchObject({ scoreId: gid, gearId: ggid });
    expect((await on(A, () => A.db.toneRuns.toArray()))[0].gearId).toBe(ggid);
    expect((await on(A, () => A.db.kv.get('gear-current')))!.value).toBe(ggid);
    expect((await on(A, () => A.db.reviews.toArray()))[0]).toMatchObject({ id: `${gid}:3`, scoreId: gid });
    expect((await on(A, () => A.db.lessonNotes.toArray()))[0].scoreId).toBe(gid);
    // 서버 표 이름은 cl 붙임, 악보 XML 은 blob 으로 (기록에는 해시만)
    const recRow = await env.DB.prepare("SELECT v FROM rec WHERE t='clscores'").first<{ v: string }>();
    expect(recRow!.v).not.toContain('<measure');
    expect(JSON.parse(recRow!.v).xmlH).toMatch(/^[0-9a-f]{64}$/);
    expect(await env.DB.prepare("SELECT COUNT(*) AS c FROM rec WHERE t NOT LIKE 'cl%'").first<{ c: number }>()).toEqual({ c: 0 });

    // ---- 기기 B (휴대폰) ----
    const B = await device();
    await on(B, async () => {
      await B.db.pieces.put({ id: 'p1', book: 1, title: '곡', key: 'F', status: 'learning' });
      await B.db.sessions.add(session(600));
      await B.db.kv.put({ key: 'settings', value: { a4: 440, latencyMs: 40, minDb: -55, perfMode: 'lite' } });
    });
    await on(B, () => B.eng.enableSync(URL_, KEY));
    expect(B.eng.getStatus().error).toBeUndefined();
    const bs = await on(B, () => B.db.scores.toArray());
    expect(bs.map((s) => [s.id, s.title, s.xml, s.accXml])).toEqual([[gid, '트로이메라이', xml('트로이메라이'), xml('반주')]]);
    expect(bs[0].listKey).toEqual([1000, '트로이메라이', '', '', 0]);
    expect((await on(B, () => B.db.pieces.get('p1')))!.status).toBe('tempo'); // 먼저 켠 기기(A)가 이김
    const st = (await on(B, () => B.db.kv.get('settings')))!.value as Record<string, unknown>;
    expect(st).toMatchObject({ a4: 442, latencyMs: 40, minDb: -55, perfMode: 'lite' }); // 기기 값(지연·감도·가벼운 모드)은 지킴
    expect(await on(B, () => B.db.scoreRuns.count())).toBe(1);
    expect(await on(B, () => B.db.toneRuns.count())).toBe(1);
    expect((await on(B, () => B.db.gear.toArray())).map((x) => x.label)).toEqual(['반도린 2.5']);

    await on(A, () => A.eng.syncNow());
    expect((await on(A, () => A.db.sessions.toArray())).map((s) => s.totalSec)).toEqual([600]);

    // ---- 고치기·지우기 ----
    await on(A, () => A.db.scores.update(gid, { breaths: { 0: { add: ['3:1'], del: [] } } }));
    await on(A, () => A.eng.syncNow());
    const nid = (await on(B, () => B.db.lessonNotes.toArray()))[0].id!;
    await on(B, () => B.db.lessonNotes.delete(nid));
    await tick();
    await on(B, () => B.eng.syncNow());
    expect((await on(B, () => B.db.scores.get(gid)))!.breaths).toEqual({ 0: { add: ['3:1'], del: [] } });
    await on(A, () => A.eng.syncNow());
    expect(await on(A, () => A.db.lessonNotes.count())).toBe(0);

    // ---- 메아리 없음 ----
    await on(B, () => B.eng.syncNow());
    await on(A, () => A.eng.syncNow());
    const s1 = await maxSeq(env);
    await on(A, () => A.eng.syncNow());
    await on(B, () => B.eng.syncNow());
    expect(await maxSeq(env)).toBe(s1);
    expect(B.eng.getStatus().pulled).toBe(0);

    // ---- 동기화 켠 뒤 새로 만든 줄도 큰 id ----
    const nsid = await on(B, () => B.db.scores.add({ title: '소나무', xml: xml('소나무'), createdAt: 9000 }));
    expect(nsid).toBeGreaterThan(1e12);
    await on(B, () => B.eng.syncNow());
    await on(A, () => A.eng.syncNow());
    expect((await on(A, () => A.db.scores.get(nsid)))!.xml).toBe(xml('소나무'));
  });

  it('바이올린 앱 기록·플룻 기록과 같은 서버에 있어도 섞이지 않음', async () => {
    const env = await server();
    // 바이올린 앱이 먼저 올려 둔 기록 (표 이름에 앞글자 없음)
    const res = await fetch(`${URL_}/push`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [
      { t: 'scores', k: '1700000000000001', u: 5, v: JSON.stringify({ id: 1700000000000001, title: '자이츠', createdAt: 1 }) },
      { t: 'pieces', k: 'p1', u: 5, v: JSON.stringify({ id: 'p1', book: 4, title: '자이츠', key: 'D', status: 'done' }) },
    ] }) });
    expect(res.ok).toBe(true);
    const C = await device('clarinet');
    await on(C, async () => { await C.db.pieces.put({ id: 'p1', book: 1, title: '클라리넷 곡', key: 'F', status: 'learning' }); });
    await on(C, () => C.eng.enableSync(URL_, KEY));
    expect(await on(C, () => C.db.scores.count())).toBe(0);
    expect((await on(C, () => C.db.pieces.get('p1')))!.title).toBe('클라리넷 곡');
    // 플룻은 따로
    const F = await device('flute');
    await on(F, async () => { await F.db.sessions.add(session(300)); });
    await on(F, () => F.eng.enableSync(URL_, KEY));
    expect(await on(F, () => F.db.pieces.count())).toBe(0);
    await on(C, () => C.eng.syncNow());
    expect(await on(C, () => C.db.sessions.count())).toBe(0);
    const ts = (await env.DB.prepare('SELECT DISTINCT t FROM rec ORDER BY t').all<{ t: string }>()).results.map((r) => r.t);
    expect(ts).toEqual(['clpieces', 'flsessions', 'pieces', 'scores']);
    // 바이올린 줄은 그대로
    expect(JSON.parse((await env.DB.prepare("SELECT v FROM rec WHERE t='pieces'").first<{ v: string }>())!.v).title).toBe('자이츠');
  });

  it('열쇠가 틀리면 켜지지 않음', async () => {
    await server();
    const A = await device();
    await expect(on(A, () => A.eng.enableSync(URL_, 'wrong-key-1234567890'))).rejects.toThrow('열쇠');
    expect(A.ls.getItem('wind-sync-clarinet')).toBeNull();
  });

  it('동기화 중 백업 되돌리기: 다른 기기 기록은 지우지 않고, 되돌린 것은 퍼짐', async () => {
    await server();
    const A = await device();
    await on(A, async () => { await A.db.pieces.put({ id: 'p1', book: 1, title: '곡', key: 'F', status: 'learning' }); });
    await on(A, () => A.eng.enableSync(URL_, KEY));
    const backup = await on(A, async () => (await A.bk.makeBackup(false)).text());
    const B = await device();
    await on(B, () => B.eng.enableSync(URL_, KEY));
    await on(B, () => B.db.sessions.add(session(700)));
    await on(B, () => B.eng.syncNow());
    await on(A, () => A.eng.syncNow());
    await on(A, () => A.db.pieces.update('p1', { status: 'done' }));
    await on(A, () => A.eng.syncNow());
    await on(A, () => A.bk.restoreBackup(backup));
    await tick();
    await on(A, () => A.eng.syncNow());
    await on(B, () => B.eng.syncNow());
    expect(await on(B, () => B.db.sessions.count())).toBe(1);
    expect(await on(A, () => A.db.sessions.count())).toBe(1);
    expect((await on(B, () => B.db.pieces.get('p1')))!.status).toBe('learning');
  });

  it('한 줄에 여러 항목(kv): 연습곡 진도·폴더는 항목별로 합침', async () => {
    await server();
    const A = await device();
    await on(A, async () => {
      await A.db.kv.put({ key: 'score-folders', value: [{ id: 'book-1', name: '1권' }] });
      await A.db.kv.put({ key: 'exercise-progress', value: { s1: { best: 80, at: 10 } } });
    });
    await on(A, () => A.eng.enableSync(URL_, KEY));
    const B = await device();
    await on(B, async () => {
      await B.db.kv.put({ key: 'score-folders', value: [{ id: 'book-1', name: '1권' }, { id: 'f-mine', name: '레슨' }] });
      await B.db.kv.put({ key: 'exercise-progress', value: { s1: { best: 95, at: 20 }, s2: { best: 50, at: 5 } } });
    });
    await on(B, () => B.eng.enableSync(URL_, KEY));
    await on(A, () => A.eng.syncNow());
    for (const D of [A, B]) {
      expect(((await on(D, () => D.db.kv.get('score-folders')))!.value as { id: string }[]).map((x) => x.id)).toEqual(['book-1', 'f-mine']);
      const ep = (await on(D, () => D.db.kv.get('exercise-progress')))!.value as Record<string, { best: number }>;
      expect([ep.s1.best, ep.s2.best]).toEqual([95, 50]);
    }
  });

  it('한 기기 시계가 빨라도 다른 기기에서 나중에 고친 것이 이김', async () => {
    await server();
    const A = await device();
    await on(A, async () => { await A.db.pieces.put({ id: 'p1', book: 1, title: '곡', key: 'F', status: 'learning' }); });
    await on(A, () => A.eng.enableSync(URL_, KEY));
    const B = await device();
    await on(B, () => B.eng.enableSync(URL_, KEY));
    const real = Date.now;
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => real() + 10 * 60_000);
    await on(A, () => A.db.pieces.update('p1', { status: 'tempo' }));
    await on(A, () => A.eng.syncNow());
    spy.mockRestore();
    await on(B, () => B.eng.syncNow());
    await on(B, () => B.db.pieces.update('p1', { status: 'done' }));
    await on(B, () => B.eng.syncNow());
    await on(A, () => A.eng.syncNow());
    expect((await on(A, () => A.db.pieces.get('p1')))!.status).toBe('done');
  });
});
