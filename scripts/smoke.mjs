// 빌드본 + 가짜 마이크(실음)로 전체 흐름 확인. 앱은 B♭ 클라리넷 악보음으로 보여줌
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';

const server = spawn('npx', ['vite', 'preview', '--port', '4319', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const URL = 'http://localhost:4319/';
const ok = (c, msg) => { console.log(`${c ? 'PASS' : 'FAIL'} ${msg}`); if (!c) process.exitCode = 1; };
const num = (s) => Number(String(s).replace(/[^\d.+-]/g, ''));

async function launch(wav) {
  const browser = await chromium.launch({
    timeout: 20000,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('scripts', wav)}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  return { browser, page, errors };
}
const seen = (loc, timeout = 4000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
const tab = (page, id) => page.getByTestId(`tab-${id}`).click();

try {
  // ── 1. 튜너·운지·기본 흐름 (실음 B♭4 +20센트 = 악보 C5 +20) ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await page.screenshot({ path: 'scripts/shot-today.png', fullPage: true });
    ok((await page.locator('.tabbar .tab').count()) === 7, '탭 7개');
    await tab(page, 'tuner');
    await page.getByTestId('mic').click();
    await page.waitForTimeout(2500);
    ok((await page.getByTestId('note').textContent()) === 'C5', `튜너 악보음 C5 (${await page.getByTestId('note').textContent()})`);
    const c = num(await page.getByTestId('cents').textContent());
    ok(Math.abs(c - 20) <= 3, `튜너 센트 ${c} (기대 +20)`);
    ok(/실음 B♭4/.test(await page.locator('.freq').textContent()), '실음 이름 B♭4 표시');
    ok(await seen(page.locator('.tuner-fing svg.fingering')), '튜너에 운지 그림');
    await page.screenshot({ path: 'scripts/shot-tuner.png', fullPage: true });
    await page.getByTestId('tune-mode').click();
    await page.waitForTimeout(2500);
    const adv = await page.getByTestId('tune-advice').textContent();
    ok(/높아요/.test(adv) && /배럴/.test(adv), `조율하기: 높으면 배럴 빼기 (${adv.slice(0, 40)})`);
    await page.screenshot({ path: 'scripts/shot-tune.png', fullPage: true });
    // 악기 바꾸기 → 실음 그대로
    await page.getByRole('button', { name: '자동' }).click();
    await page.getByLabel('악기').selectOption('C');
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('note').textContent()) === 'B♭4', `악기를 실음으로 → B♭4 (${await page.getByTestId('note').textContent()})`);
    await page.getByLabel('악기').selectOption('Bb');
    await page.getByTestId('mic').click();

    // 운지표
    await tab(page, 'fingering');
    ok(await seen(page.getByTestId('fg-card')), '운지 카드');
    ok((await page.getByTestId('fg-grid').locator('.chip').count()) === 19, `낮은 음역 E3~B♭4 19음 (${await page.getByTestId('fg-grid').locator('.chip').count()})`);
    await page.getByTestId('fg-grid').getByRole('button', { name: 'B♭4' }).click();
    ok(/A 키/.test(await page.getByTestId('fg-card').textContent()) && /레지스터/.test(await page.getByTestId('fg-card').textContent()), 'B♭4 = A 키 + 레지스터');
    ok((await page.getByTestId('fg-card').locator('.fg-on').count()) === 2, 'B♭4 그림에 키 2개 칠함');
    await page.getByRole('button', { name: '마이크 켜기' }).click();
    await page.waitForTimeout(2500);
    ok((await page.getByTestId('fg-heard').textContent()) === 'C5', '불어 보기: C5');
    ok(/^C5/.test(await page.getByTestId('fg-card').locator('.note-big').textContent()), '부는 음(C5)의 운지로 바뀜 (가운데 음역으로)');
    ok((await page.getByTestId('fg-card').locator('.fg-on').count()) === 9, `C5 운지: 레지스터+엄지+6구멍+F/C = 9 (${await page.getByTestId('fg-card').locator('.fg-on').count()})`);
    await page.screenshot({ path: 'scripts/shot-fingering.png', fullPage: true });
    await page.getByTestId('quiz-tab').click();
    ok(await seen(page.getByTestId('quiz-card').locator('svg.mini-staff')), '운지 퀴즈: 오선');
    await page.getByRole('button', { name: '힌트 (운지 보기)' }).click();
    ok(await seen(page.getByTestId('quiz-card').locator('svg.fingering')), '퀴즈 힌트: 운지 그림');
    await page.screenshot({ path: 'scripts/shot-quiz.png', fullPage: true });

    await tab(page, 'metronome');
    await page.getByRole('button', { name: '+5' }).click();
    ok((await page.getByTestId('bpm').textContent()) === '85', 'BPM 80 → 85');
    await page.getByTestId('metro-toggle').click();
    await page.waitForTimeout(1200);
    ok((await page.locator('.dot.on').count()) === 1, '박 표시');
    await page.getByTestId('metro-toggle').click();

    // 곡 추가 → 오늘의 곡
    await tab(page, 'log');
    await page.getByRole('button', { name: '곡', exact: true }).click();
    await page.getByPlaceholder('곡 이름').fill('루뱅크 3번');
    await page.getByRole('button', { name: '추가' }).click();
    ok(await seen(page.getByRole('button', { name: '전체 1' })), '곡 추가');
    await page.screenshot({ path: 'scripts/shot-pieces.png' });

    // 세션
    await tab(page, 'today');
    await page.getByTestId('session-start').click();
    await page.waitForTimeout(600);
    ok((await page.getByTestId('session-item').textContent()) === '조립·리드·튜닝', '첫 항목 조립·리드·튜닝');
    await page.getByTestId('session-next').click();
    ok((await page.getByTestId('session-item').textContent()) === '롱톤', '둘째 항목 롱톤');
    for (let i = 0; i < 2; i++) await page.getByTestId('session-next').click();
    await page.waitForTimeout(400);
    ok((await page.getByTestId('session-item').textContent()) === '음계·연습곡' && await seen(page.getByTestId('basics-card')), '음계·연습곡 항목에 기초 연습 추천');
    await page.getByTestId('session-next').click();
    await page.locator('.session .chips .chip').first().click();
    await page.waitForTimeout(1100);
    await page.screenshot({ path: 'scripts/shot-session.png', fullPage: true });
    await page.getByTestId('session-finish').click();
    await page.getByPlaceholder(/메모/).fill('스모크 테스트');
    await page.getByTestId('session-save').click();
    await page.waitForTimeout(400);
    await tab(page, 'log');
    await page.locator('.log .segmented').getByRole('button', { name: '연습 기록' }).click();
    await page.screenshot({ path: 'scripts/shot-log.png', fullPage: true });
    ok((await page.getByText('스모크 테스트').count()) >= 1, '세션 메모 저장');
    ok(await page.getByText(/곡 연습 · 루뱅크 3번/).isVisible(), '세션에 곡 이름 기록');

    // 녹음 2개 → 비교 (악보음 기준 +20)
    await page.locator('.log .segmented').first().getByRole('button', { name: '녹음' }).click();
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('rec-toggle').click();
      await page.waitForTimeout(2500);
      await page.getByTestId('rec-toggle').click();
      await page.waitForTimeout(700);
    }
    ok(await page.getByText('녹음 2개').isVisible(), '녹음 2개 저장');
    const boxes = page.getByRole('checkbox', { name: '비교에 넣기' });
    await boxes.nth(0).check(); await boxes.nth(1).check();
    const statText = await page.getByTestId('compare').textContent();
    ok(/평균 ±(19|20|21)센트/.test(statText), `녹음 음정 요약: ${statText.match(/평균 ±\d+센트/)?.[0]}`);
    await page.screenshot({ path: 'scripts/shot-compare.png', fullPage: true });

    await page.reload();
    await tab(page, 'metronome');
    ok((await page.getByTestId('bpm').textContent()) === '85', '새로고침 후 BPM 유지');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 2. 음정 그래프 + 악보 채점 (실음이 2반음 아래인 phrases.wav) ──
  {
    const { browser, page, errors } = await launch('phrases.wav');
    await tab(page, 'tone');
    await page.getByTestId('mode-graph').click();
    await page.getByTestId('mic-toggle').click();
    await page.waitForTimeout(5000);
    const rows = await page.getByTestId('note-summary').locator('tbody tr').allTextContents();
    ok(rows.some((r) => /^B4\+[5-7]2$/.test(r)) && rows.some((r) => /^C♯5-[5-7]1$/.test(r)), `음별 평균 (악보음): B4 +6(2회), C♯5 -6: ${rows.join(' / ')}`);
    await page.screenshot({ path: 'scripts/shot-graph.png', fullPage: true });
    await page.getByTestId('mic-toggle').click();

    await tab(page, 'score');
    await page.waitForFunction(() => /교재 곡/.test(document.querySelector('[data-testid=folder-chips]')?.textContent ?? ''), null, { timeout: 4000 }).catch(() => {});
    const chips = await page.getByTestId('folder-chips').textContent();
    ok(/교재 곡/.test(chips) && /합주 곡/.test(chips) && /기타 곡/.test(chips), `기본 폴더 (${chips})`);
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-score.musicxml'));
    await page.waitForTimeout(1500);
    ok((await page.locator('[data-testid=osmd] svg').count()) >= 1, '악보 그리기');
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(800);
    await page.getByTestId('score-start').click();
    await page.waitForTimeout(5200);
    await page.getByTestId('score-stop').click();
    await page.waitForTimeout(1200);
    const res = await page.getByTestId('score-result').textContent();
    const pct = Number(res.match(/(\d+)%/)?.[1]);
    ok(pct >= 80, `채점 결과 맞은 음 ${pct}% (${res.match(/맞은 음 \d+\/\d+/)?.[0]})`);
    ok(/B4\+1[0-4]/.test(res), 'B4 +12센트를 가장 벗어난 음으로 표시');
    ok(/녹음/.test(await page.getByTestId('run-saved').textContent().catch(() => '')), '채점하면 연습 기록과 녹음 저장');
    await page.screenshot({ path: 'scripts/shot-score.png', fullPage: true });
    // 악보 듣기 (클라리넷 샘플)
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(2200);
    ok((await page.locator('[data-testid=osmd] .now-note').count()) > 0, '재생 중 현재 음 강조');
    ok(!/불러오지 못해서/.test(await page.locator('.page').textContent()), '클라리넷 샘플 불러오기');
    await page.waitForTimeout(2500);
    ok(/들어보기/.test(await page.getByTestId('play-toggle').textContent()), '재생 끝나면 버튼 복귀');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 3. 연습곡 · 쉬운 곡 · 텅잉 변형 ──
  {
    const { browser, page, errors } = await launch('phrases.wav');
    await tab(page, 'score');
    await page.getByTestId('open-exercises').click();
    await page.getByTestId('ex-A2').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    ok(/왼손 다섯 음/.test(await page.locator('.score-title').textContent()), '첫 소리 연습 (왼손 다섯 음)');
    ok(Number(await page.getByTestId('play-bpm').inputValue()) === 60, '단계 템포 ♩=60');
    await page.screenshot({ path: 'scripts/shot-exercise.png', fullPage: true });
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('ex-B3').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    ok(/반짝반짝 작은 별/.test(await page.locator('.score-title').textContent()), '쉬운 곡 (반짝반짝 작은 별)');
    await page.screenshot({ path: 'scripts/shot-song.png', fullPage: true });
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('ex-D2').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    ok(/브레이크를 넘는 음 \d+개/.test(await page.getByTestId('exercise-card').textContent()), '브레이크 넘기: 넘는 음 따로 표시');
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('ex-E6').click();
    await page.getByTestId('ex-regen').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1200);
    const h1 = await page.locator('[data-testid=osmd] svg').first().innerHTML();
    await page.getByTestId('ex-regen').click();
    await page.waitForTimeout(2500);
    const h2 = await page.locator('[data-testid=osmd] svg').first().innerHTML();
    ok(h1 !== h2 && /#2/.test(await page.locator('.score-title').textContent()), '다른 에튀드 만들기');
    await page.screenshot({ path: 'scripts/shot-etude.png', fullPage: true });
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('art-base').selectOption('break');
    await page.getByTestId('art-3').click();
    await page.getByTestId('bow-next').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1200);
    ok(/3\. 4음 슬러/.test(await page.locator('.score-title').textContent()), '텅잉 변형 3 (4음 슬러)');
    await page.getByTestId('bow-next').click();
    await page.waitForTimeout(2000);
    ok(/4\. 8음 슬러/.test(await page.locator('.score-title').textContent()), '다음 변형으로');
    await page.screenshot({ path: 'scripts/shot-art.png', fullPage: true });
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByRole('button', { name: '◀ 목록' }).click();
    ok(/내 악보 0개/.test(await page.locator('.page').textContent()), '연습곡은 내 악보 목록과 따로');
    await tab(page, 'today');
    ok(await seen(page.getByTestId('basics-card')), '오늘의 기초 연습 카드');
    await page.getByTestId('today-art').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1000);
    const artTitle = await page.locator('.score-title').textContent();
    ok(/텅잉 1\. 모두 텅잉/.test(artTitle), `추천 텅잉 연습 바로 열기 (${artTitle})`);
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 4. 롱톤 (악보음 G4 +5센트, 6초, 점점 크게) ──
  {
    const { browser, page, errors } = await launch('longtone.wav');
    await tab(page, 'tone');
    await page.getByTestId('mode-long').click();
    await page.getByTestId('lt-start').click();
    ok(await seen(page.getByTestId('lt-result'), 12000), '롱톤 결과');
    const r = await page.getByTestId('lt-result').textContent();
    ok(/G4/.test(r), `롱톤 음 G4 (${r.slice(0, 30)})`);
    const sec = Number(r.match(/G4([\d.]+)초/)?.[1]);
    ok(sec >= 5 && sec <= 6.6, `롱톤 길이 ${sec}초 (기대 약 6)`);
    ok(/\+[4-6]평균 음정/.test(r), `평균 음정 +5 (${r.match(/[+-]?\d+평균 음정/)?.[0]})`);
    ok(await seen(page.locator('svg.tone-graph')), '음정·크기 그래프');
    await page.screenshot({ path: 'scripts/shot-longtone.png', fullPage: true });
    await page.getByTestId('lt-stop').click().catch(() => {});
    ok(/최근 롱톤/.test(await page.locator('.page').textContent()), '롱톤 기록 저장');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 5. 텅잉 ──
  {
    const { browser, page, errors } = await launch('tongue.wav');
    await tab(page, 'tone');
    await page.getByTestId('mode-tongue').click();
    await page.getByRole('button', { name: '8분음표' }).click(); // 0.5초 박마다 0.25초 어택이 있어 위상과 상관없이 맞음
    await page.getByTestId('tongue-start').click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'scripts/shot-tongue-live.png', fullPage: true });
    ok(await seen(page.getByTestId('tongue-result'), 15000), '텅잉 결과');
    const t = await page.getByTestId('tongue-result').textContent();
    const hits = Number((await page.getByTestId('tongue-hits').textContent()).split('/')[0]);
    console.log('  텅잉 결과:', t.slice(0, 120));
    ok(hits >= 14, `텅잉 어택 ${hits}/16 찾음`);
    await page.screenshot({ path: 'scripts/shot-tongue.png', fullPage: true });
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }
} catch (e) {
  console.log('FAIL 예외', e.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  process.exit(process.exitCode ?? 0);
}
