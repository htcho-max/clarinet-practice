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
    await page.getByLabel('조 (이조)').selectOption('C');
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('note').textContent()) === 'B♭4', `악기를 실음으로 → B♭4 (${await page.getByTestId('note').textContent()})`);
    await page.getByLabel('조 (이조)').selectOption('Bb');
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
    await page.locator('.log .segmented').getByRole('button', { name: '달력' }).click();
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
        // 백업 → 되돌리기
    await tab(page, 'today');
    await page.getByRole('button', { name: '설정' }).click();
    ok(await seen(page.getByTestId('set-tol-normal')) && await seen(page.getByTestId('latency')), '설정: 음정 판정 기준·이어폰 지연 보정');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup').click()]);
    const fp = await dl.path();
    const fs = await import('node:fs');
    const bk = JSON.parse(fs.readFileSync(fp, 'utf8'));
    ok(bk.version === 2 && bk.tables.sessions.length >= 1 && bk.tables.pieces.length >= 1, `백업 파일 (세션 ${bk.tables.sessions.length}, 곡 ${bk.tables.pieces.length})`);
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('restore-file').setInputFiles(fp);
    ok(/되돌렸어요/.test(await page.getByTestId('data-msg').textContent({ timeout: 5000 }).catch(() => '')), '백업에서 되돌리기');
    await page.waitForTimeout(2500);
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
    ok(await seen(page.getByTestId('tol-normal')) && /\bon\b/.test(await page.getByTestId('tol-normal').getAttribute('class')), '판정 기준 칩 (기본 보통)');
    await page.getByTestId('score-start').click();
    await page.waitForTimeout(2500);
    const lp = await page.getByTestId('live-pitch').first().textContent().catch(() => '');
    ok(/[A-G]/.test(lp ?? ''), `채점 중 지금 내는 음 (${lp})`);
    await page.waitForTimeout(2700);
    await page.getByTestId('score-stop').click();
    await page.waitForTimeout(1200);
    const res = await page.getByTestId('score-result').textContent();
    const pct = Number(res.match(/(\d+)%/)?.[1]);
    ok(pct >= 80, `채점 결과 맞은 음 ${pct}% (${res.match(/맞은 음 \d+\/\d+/)?.[0]})`);
    ok(/B4\+1[0-4]/.test(res), 'B4 +12센트를 가장 벗어난 음으로 표시');
    ok(/녹음/.test(await page.getByTestId('run-saved').textContent().catch(() => '')), '채점하면 연습 기록과 녹음 저장');
    await page.screenshot({ path: 'scripts/shot-score.png', fullPage: true });
    const tags = await page.getByTestId('dev-tag').allTextContents();
    ok(tags.some((t) => /^▲1[0-4]$/.test(t)), `음표 옆 ▲ 높게 표시 (${tags.join(' ')})`);
    ok(/±10센트 안/.test(await page.getByTestId('dev-legend').textContent()), '결과 범례 (보통 ±10)');
    await page.getByTestId('tol-relaxed').click();
    await page.waitForTimeout(500);
    ok(/±15센트 안/.test(await page.getByTestId('dev-legend').textContent()) && !(await page.getByTestId('dev-tag').allTextContents()).some((t) => /^▲1[0-4]$/.test(t)), '관대로 바꾸면 ±15 안의 음은 ▲ 표시 없음');
    await page.getByTestId('tol-normal').click();
    // 채점할 때 박자 (깜빡임)
    await page.getByTestId('score-metro-visual').click();
    await page.getByTestId('score-start').click();
    ok(await seen(page.getByTestId('beat-dot'), 3000), '채점 중 박자 깜빡임 점');
    await page.waitForTimeout(800);
    await page.getByTestId('score-stop').click();
    await page.getByTestId('score-metro-off').click();
    await page.waitForTimeout(800);
    // 두 번째 채점 → 지난 기록 다시 보기·발전 그래프
    await page.getByTestId('score-start').click();
    await page.waitForTimeout(5200);
    await page.getByTestId('score-stop').click();
    await page.waitForTimeout(1500);
    ok(await seen(page.getByTestId('progress-card')), '발전 그래프 (기록 2번)');
    ok(await seen(page.getByTestId('run-chart')), `발전 그래프 선 (${(await page.getByTestId('progress-card').textContent().catch(() => '')).slice(0, 40)})`);
    await page.getByTestId('run-history').locator('.rec-title').nth(1).click();
    ok(await seen(page.getByTestId('run-history').getByTestId('run-insight')), `지난 기록 요약 (${(await page.getByTestId('run-history').getByTestId('run-insight').textContent().catch(() => '')).slice(0, 50)})`);
    await page.getByTestId('run-show').first().click();
    await page.waitForTimeout(1200);
    ok(await seen(page.getByTestId('past-run')), '지난 기록을 악보에 다시 보기');
    ok((await page.getByTestId('dev-tag').allTextContents()).some((t) => /^▲1[0-4]$/.test(t)), '지난 기록도 ▲ 높게 표시');
    // 레슨 노트: 마디 붙이면 악보에 📝
    await page.getByTestId('lesson-text').fill('B4 낮추기: 입술 덜 조이기');
    await page.getByTestId('lesson-measure').fill('1');
    await page.getByTestId('lesson-add').click();
    ok(await seen(page.getByTestId('lesson-card').getByTestId('lesson-note')), '레슨 노트 추가');
    ok(await seen(page.getByTestId('lesson-top')), '악보 위 레슨 체크리스트');
    ok(await seen(page.getByTestId('lesson-pin'), 3000), '악보에 레슨 노트 📝');
    // 음 고치기 → 원래대로
    await page.getByTestId('edit-toggle').click();
    await page.locator('[data-testid=osmd] .vf-notehead').nth(0).scrollIntoViewIfNeeded();
    const h0 = await page.locator('[data-testid=osmd] .vf-notehead').nth(0).boundingBox();
    if (h0) await page.mouse.click(h0.x + h0.width / 2, h0.y + h0.height / 2);
    ok(await seen(page.getByTestId('edit-sheet'), 2000), '음 고치기 창');
    const before0 = await page.getByTestId('edit-note').textContent();
    await page.getByTestId('edit-up').click();
    await page.waitForTimeout(1200);
    const after0 = await page.getByTestId('edit-note').textContent();
    ok(before0 === 'A4' && after0 === 'B♭4', `반음 올리기 (${before0} → ${after0})`);
    await page.getByTestId('edit-close').click();
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('edit-revert-all').click();
    await page.waitForTimeout(1500);
    const h1 = await page.locator('[data-testid=osmd] .vf-notehead').nth(0).boundingBox();
    if (h1) await page.mouse.click(h1.x + h1.width / 2, h1.y + h1.height / 2);
    ok((await page.getByTestId('edit-note').textContent({ timeout: 2000 }).catch(() => '')) === 'A4', '원래 악보로 되돌리기');
    await page.getByTestId('edit-close').click().catch(() => {});
    await page.getByTestId('edit-toggle').click();
    await page.screenshot({ path: 'scripts/shot-records.png', fullPage: true });
    // 음표 눌러 그 마디부터
    await page.locator('[data-testid=osmd] .vf-notehead').nth(4).scrollIntoViewIfNeeded();
    const head = await page.locator('[data-testid=osmd] .vf-notehead').nth(4).boundingBox();
    if (head) await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2);
    ok(await seen(page.getByTestId('here-bar'), 2000), `음표 누르면 "여기부터" (${(await page.getByTestId('here-bar').textContent().catch(() => '')).slice(0, 12)})`);
    await page.getByTestId('here-play').click();
    await page.waitForTimeout(600);
    ok((await page.getByTestId('from').inputValue()) === '2' && /멈추기/.test(await page.getByTestId('play-toggle').textContent()), `그 마디부터 듣기 (${await page.getByTestId('from').inputValue()}마디)`);
    await page.getByTestId('play-toggle').click();
    await page.getByTestId('from').fill('1');
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(800);
    // 악보 듣기 (클라리넷 샘플)
    ok(await page.getByTestId('expressive').isChecked(), '셈여림·아티큘레이션 살리기 기본 켜짐');
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(2200);
    ok((await page.locator('[data-testid=osmd] .now-note').count()) > 0, '재생 중 현재 음 강조');
    ok(!/불러오지 못해서/.test(await page.locator('.page').textContent()), '클라리넷 샘플 불러오기');
    await page.waitForTimeout(2500);
    ok(/들어보기/.test(await page.getByTestId('play-toggle').textContent()), '재생 끝나면 버튼 복귀');
    // 재생 중 템포 변경: 끊기지 않고 이어서 재생
    await page.getByTestId('play-bpm').fill('40');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(7500); // 카운트인 4박(6초) + 첫 음
    const before = await page.evaluate(() => document.querySelector('.now-note')?.id);
    await page.getByTestId('play-bpm').fill('200');
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => document.querySelector('.now-note')?.id);
    ok(!!before && !!after && before !== after, `재생 중 템포 변경 후 계속 진행 (${before} → ${after})`);
    // 떠 있는 조작: 멈춤 → 이어서
    if (await page.getByTestId('float-stop').isVisible().catch(() => false)) await page.getByTestId('float-stop').click();
    await page.getByTestId('play-bpm').fill('60');
    await page.getByTestId('play-bpm').blur();
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(5000);
    ok(await seen(page.getByTestId('float-pause')), '재생 중 떠 있는 멈춤 버튼');
    await page.getByTestId('float-pause').click();
    const pausedId = await page.evaluate(() => document.querySelector('.now-note')?.id);
    await page.waitForTimeout(1200);
    const still = await page.evaluate(() => document.querySelector('.now-note')?.id);
    ok(!!pausedId && pausedId === still, `멈추면 그 음에서 정지 (${pausedId})`);
    await page.getByTestId('float-resume').click();
    await page.waitForTimeout(1600);
    const moved = await page.evaluate(() => document.querySelector('.now-note')?.id);
    ok(!!moved && moved !== pausedId, `이어서 재생 (${pausedId} → ${moved})`);
    await page.getByTestId('float-stop').click();
    ok(!(await page.getByTestId('float-ctl').isVisible().catch(() => false)), '정지하면 떠 있는 막대 사라짐');
    // 마디 입력: 다 지우고 새로 입력, 길이 칩
    await page.getByTestId('to').fill('');
    await page.getByTestId('to').fill('2');
    await page.getByTestId('to').blur();
    ok((await page.getByTestId('to').inputValue()) === '2', '끝 마디 지우고 다시 입력');
    await page.getByTestId('len-chips').getByRole('button', { name: '1마디' }).click();
    await page.waitForTimeout(400);
    ok((await page.getByTestId('to').inputValue()) === (await page.getByTestId('from').inputValue()), '1마디 칩 → 끝 = 시작');
    await page.getByRole('button', { name: '끝 마디 늘리기' }).click();
    await page.waitForTimeout(400);
    ok(Number(await page.getByTestId('to').inputValue()) === Number(await page.getByTestId('from').inputValue()) + 1, '끝 마디 + 버튼');
    // 휴대폰 뒤로 가기: 악보 → 목록
    await page.goBack();
    ok(await seen(page.getByTestId('open-exercises')), `뒤로 가기로 악보 목록 (${page.url()})`);
    await page.getByTestId('score-open').first().click();
    await page.waitForTimeout(1200);
    const order = await page.evaluate(() => { const a = document.querySelector('[data-testid=play-card]'), b = document.querySelector('.score-sheet'); return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    ok(order, '메뉴가 악보 위에 있음');
    await page.screenshot({ path: 'scripts/shot-layout.png', fullPage: true });
    // 셈여림 비교 (p < f 가 있는 악보)
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-dyn.musicxml'));
    await page.waitForTimeout(1500);
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(600);
    await page.getByTestId('score-start').click();
    await page.waitForTimeout(5200);
    await page.getByTestId('score-stop').click();
    await page.waitForTimeout(1200);
    ok(await seen(page.getByTestId('view-dyn')), '셈여림으로 보기 버튼');
    await page.getByTestId('view-dyn').click();
    ok(await seen(page.getByTestId('dyn-chart')), `셈여림 비교 (${(await page.getByTestId('dyn-chart').textContent().catch(() => '')).slice(0, 40)})`);
    await page.screenshot({ path: 'scripts/shot-dyn.png', fullPage: true });
    // 연습 기록 탭: 오늘 악보 연습 + 녹음 연동
    await page.getByTestId('play-toggle').click().catch(() => {});
    await tab(page, 'log');
    await page.locator('.log .segmented').getByRole('button', { name: '달력' }).click();
    ok(await seen(page.getByTestId('day-runs')), '달력 오늘 칸에 악보 연습 기록');
    await page.getByTestId('day-runs').locator('.rec-title').first().click();
    ok(await seen(page.getByTestId('day-runs').locator('audio')), '연습 기록에서 녹음 재생');
    ok(await seen(page.getByTestId('day-runs').getByTestId('run-insight')), '달력 기록에 분석 요약');
    ok(await seen(page.getByTestId('lesson-log')), '기록에 레슨 노트');
    await page.screenshot({ path: 'scripts/shot-runs.png', fullPage: true });
    await page.locator('.log .segmented').first().getByRole('button', { name: '녹음' }).click();
    await page.getByTestId('rec-filter').getByRole('button', { name: '악보 연습' }).click();
    await page.locator('.rec-list .rec-title').first().click();
    ok(/악보 채점: 1~2마디/.test(await page.getByTestId('rec-run').textContent().catch(() => '')), '녹음 목록에 악보 채점 결과 연동');
    // 달력 기록 → 악보에서 분석 보기
    await page.locator('.log .segmented').getByRole('button', { name: '달력' }).click();
    await page.getByTestId('day-runs').locator('.rec-title').first().click();
    await page.getByTestId('log-run-show').first().click();
    ok(await seen(page.getByTestId('past-run'), 5000), '기록 화면에서 악보 분석 바로 열기');
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
  // ── 7. 플룻 (야마하 YFL-222): 설정에서 악기 바꾸기 → 기록 따로, 이조 없음 ──
  {
    const { browser, page, errors } = await launch('fl_a4.wav');
    await page.getByTestId('session-start').click();
    await page.waitForTimeout(2300);
    await page.getByTestId('session-finish').click();
    await page.getByTestId('session-save').click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '설정' }).click();
    page.once('dialog', (d) => d.accept());
    await Promise.all([page.waitForEvent('load'), page.getByTestId('inst-flute').click()]);
    await page.waitForTimeout(800);
    ok(/플룻 · 야마하 YFL-222/.test(await page.getByTestId('inst-chip').textContent()), '플룻으로 바꾸기');
    ok(/0초/.test(await page.locator('.stat-line').textContent()), '플룻 기록은 따로 (오늘 0초)');
    ok((await page.locator('title').textContent()) === '플룻 연습 도우미', '제목 플룻');
    await tab(page, 'tuner');
    ok(!(await page.getByLabel('조 (이조)').isVisible().catch(() => false)), '플룻은 이조 설정 없음');
    await page.getByTestId('mic').click();
    await page.waitForTimeout(2500);
    ok((await page.getByTestId('note').textContent()) === 'A4', `플룻 튜너 A4 (이조 없음) (${await page.getByTestId('note').textContent()})`);
    const c = num(await page.getByTestId('cents').textContent());
    ok(Math.abs(c - 20) <= 3, `플룻 튜너 센트 ${c} (기대 +20)`);
    await page.getByTestId('tune-mode').click();
    await page.waitForTimeout(2500);
    const adv = await page.getByTestId('tune-advice').textContent();
    ok(/헤드조인트/.test(adv), `조율하기: 헤드조인트 안내 (${adv.slice(0, 30)})`);
    await page.getByTestId('mic').click();
    await tab(page, 'fingering');
    ok((await page.getByTestId('fg-grid').locator('.chip').count()) === 14, `플룻 1옥타브 C4~C♯5 14음 (${await page.getByTestId('fg-grid').locator('.chip').count()})`);
    ok(/YFL-222/.test(await page.locator('.fg-model').textContent()), '운지 기준 YFL-222');
    await page.getByRole('button', { name: '마이크 켜기' }).click();
    await page.waitForTimeout(2500);
    ok((await page.getByTestId('fg-heard').textContent()) === 'A4', '플룻 불어 보기 A4');
    ok(await seen(page.getByTestId('fg-card').locator('svg.fingering.flute')), '플룻 가로 운지 그림');
    ok((await page.getByTestId('fg-card').locator('.fg-on').count()) === 4, `A4 운지: 엄지 B + 검지·중지 + E♭ 키 = 4 (${await page.getByTestId('fg-card').locator('.fg-on').count()})`);
    await page.screenshot({ path: 'scripts/shot-flute-fingering.png', fullPage: true });
    await page.getByRole('button', { name: '마이크 끄기' }).click();
    await tab(page, 'tone');
    await page.getByTestId('mode-long').click();
    ok(/\bon\b/.test(await page.locator('.card').filter({ hasText: '음 고르기' }).getByRole('button', { name: 'B4', exact: true }).getAttribute('class')), '플룻 롱톤 기본 음 B4');
    await tab(page, 'score');
    await page.getByTestId('open-exercises').click();
    await page.getByTestId('ex-A1').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    ok(/B4 A4 G4/.test(await page.locator('.score-title').textContent()), '플룻 첫 소리 (B A G)');
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(2500);
    ok(!/불러오지 못해서/.test(await page.locator('.page').textContent()), '플룻 샘플 불러오기');
    await page.getByTestId('play-toggle').click().catch(() => {});
    await page.screenshot({ path: 'scripts/shot-flute-exercise.png', fullPage: true });
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByTestId('ex-D3').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    ok(/C♯5↔D5를 넘는 음 \d+개/.test(await page.getByTestId('exercise-card').textContent()), '플룻 C♯5↔D5 넘는 음 표시');
    // 클라리넷으로 돌아가면 기록 그대로
    await tab(page, 'today');
    await page.getByRole('button', { name: '설정' }).click();
    page.once('dialog', (d) => d.accept());
    await Promise.all([page.waitForEvent('load'), page.getByTestId('inst-clarinet').click()]);
    await page.waitForTimeout(800);
    const back = `${await page.getByTestId('inst-chip').textContent()} / ${await page.locator('.stat-line').textContent()}`;
    ok(/클라리넷/.test(back) && !/오늘 0초/.test(back), `클라리넷으로 돌아오면 기록 그대로 (${back})`);
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 6. 태블릿 가로 (1180×820) ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await page.setViewportSize({ width: 1180, height: 820 });
    await tab(page, 'fingering');
    await page.waitForTimeout(500);
    const g = await page.getByTestId('fg-grid').boundingBox(), c = await page.getByTestId('fg-card').boundingBox();
    ok(!!g && !!c && c.x > g.x + g.width - 1, `태블릿: 운지표 음 고르기 왼쪽, 운지 카드 오른쪽 (${Math.round(g?.x ?? 0)} / ${Math.round(c?.x ?? 0)})`);
    await page.screenshot({ path: 'scripts/shot-tablet-fingering.png' });
    await page.getByTestId('quiz-tab').click();
    await page.goBack();
    ok(await seen(page.getByTestId('fg-grid')), '뒤로 가기: 운지 퀴즈 → 운지표');
    await tab(page, 'tone');
    await page.getByTestId('mode-long').click();
    const set = await page.locator('.tone > .card').first().boundingBox(), live = await page.getByTestId('longtone-live').boundingBox();
    ok(!!set && !!live && live.x > set.x + 10 && live.y < 400, '태블릿 가로: 롱톤 설정 왼쪽, 재는 화면 오른쪽 위');
    await page.screenshot({ path: 'scripts/shot-tablet-tone.png' });
    await tab(page, 'score');
    await page.getByTestId('open-exercises').click();
    await page.getByTestId('ex-B3').click();
    await page.getByTestId('exercise-card').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    const top = await page.locator('.score-top').boundingBox(), main = await page.locator('.score-main').boundingBox();
    ok(!!top && !!main && main.x > top.x + top.width - 1, '태블릿 가로: 왼쪽 조작, 오른쪽 악보');
    await page.screenshot({ path: 'scripts/shot-tablet-score.png' });
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 8. v0.5 학습 기능: 템포 사다리·복습함·넘기·따라 불기·리드·분석·도돌이표 (악보음 C5 계속) ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await tab(page, 'score');
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-repeat.musicxml'));
    await page.waitForTimeout(1500);
    ok(await seen(page.getByTestId('unfold')), '도돌이표 있는 악보: "도돌이표대로" 보임');
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(500);
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(800);
    await page.getByTestId('play-toggle').click().catch(() => {});
    // 리드 추가 (이름, 세기 두 번 묻기)
    let n = 0;
    const onDialog = (d) => { d.accept(n++ === 0 ? '#7' : '반도린 3'); };
    page.on('dialog', onDialog);
    await page.getByTestId('gear-select').first().selectOption('new');
    await page.waitForTimeout(600);
    page.off('dialog', onDialog);
    ok(/#7 · 반도린 3/.test(await page.getByTestId('gear-select').first().locator('option:checked').textContent()), '새 리드 추가하면 지금 리드로');
    await page.getByTestId('ladder-on').check();
    ok(/♩=/.test(await page.getByTestId('ladder-row').textContent()), '템포 사다리 켜기');
    await page.getByTestId('score-start').click();
    await page.waitForTimeout(6500);
    await page.getByTestId('score-stop').click();
    ok(await seen(page.getByTestId('ladder-msg'), 4000), `사다리 판정 (${await page.getByTestId('ladder-msg').textContent().catch(() => '')})`);
    ok(await seen(page.getByTestId('review-msg'), 4000), `복습함에 넣음 (${await page.getByTestId('review-msg').textContent().catch(() => '')})`);
    await page.screenshot({ path: 'scripts/shot-ladder.png', fullPage: true });
    // 오늘의 연습: 내일 복습이라 오늘은 없음 → 날짜를 하루 당겨 확인
    await page.evaluate(async () => {
      const req = indexedDB.open('clarinet-practice');
      await new Promise((res) => { req.onsuccess = res; });
      const db = req.result; const tx = db.transaction('reviews', 'readwrite'); const st = tx.objectStore('reviews');
      const all = await new Promise((res) => { const g = st.getAll(); g.onsuccess = () => res(g.result); });
      for (const r of all) st.put({ ...r, due: '2000-01-01' });
      await new Promise((res) => { tx.oncomplete = res; });
    });
    await page.reload(); // 앱(Dexie)의 조회 캐시를 비우려고
    await page.waitForTimeout(800);
    await tab(page, 'today');
    ok(await seen(page.getByTestId('review-card')), '오늘의 연습에 틀린 마디 복습');
    await page.screenshot({ path: 'scripts/shot-review.png', fullPage: true });
    await page.getByTestId('review-open').first().click();
    ok(await seen(page.getByTestId('score-view'), 5000), '복습 마디 누르면 악보 열림');
    const rh = await seen(page.getByTestId('review-here'), 6000);
    ok(rh, '악보에 오늘 복습할 마디');
    const f = await page.getByTestId('from').inputValue(), t = await page.getByTestId('to').inputValue();
    ok(f === '1' && t === '2', `이어진 복습 마디를 한 구간으로 (${f}~${t})`);
    // 넘기
    await tab(page, 'tone');
    await page.getByTestId('mode-break').click();
    await page.getByTestId('break-start').click();
    await page.waitForTimeout(2000);
    await page.getByTestId('break-stop').click();
    ok(await seen(page.getByTestId('break-result')), '넘기 결과 (한 음만 불면 넘기 0번)');
    ok(/번갈아/.test(await page.getByTestId('break-result').textContent()), '넘기 안내');
    await page.screenshot({ path: 'scripts/shot-break.png', fullPage: true });
    // 따라 불기
    await page.getByTestId('mode-echo').click();
    await page.getByTestId('echo-new').click();
    await page.waitForFunction(() => /따라 불어요/.test(document.querySelector('[data-testid=echo-phase]')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
    ok(/따라 불어요/.test(await page.getByTestId('echo-phase').textContent()), '문제를 들려준 뒤 듣기');
    await page.waitForTimeout(1500);
    await page.getByTestId('echo-stop').click();
    ok(await seen(page.getByTestId('echo-result')), `따라 불기 채점 (${(await page.getByTestId('echo-result').textContent().catch(() => '')).slice(0, 40)})`);
    await page.screenshot({ path: 'scripts/shot-echo.png', fullPage: true });
    // 분석
    await tab(page, 'log');
    await page.getByTestId('log-insights').click();
    ok(await seen(page.getByTestId('trends')), '주별 추이');
    ok(await seen(page.getByTestId('habits')), '음정 습관 지도');
    ok(await seen(page.getByTestId('gear-card').getByText('#7')), '리드 기록 표');
    await page.screenshot({ path: 'scripts/shot-insights.png', fullPage: true });
    await page.getByTestId('trends-table').click();
    ok((await page.getByTestId('trends').locator('tbody tr').count()) === 8, '추이 표 8주');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 9. 넘기 (A4 ↔ B4, 끊김·끽 소리 섞임) ──
  {
    const { browser, page, errors } = await launch('break.wav');
    await tab(page, 'tone');
    await page.getByTestId('mode-break').click();
    await page.getByTestId('break-start').click();
    await page.waitForTimeout(7000);
    await page.getByTestId('break-stop').click().catch(() => {});
    ok(await seen(page.getByTestId('break-result')), '넘기 결과');
    const r = await page.getByTestId('break-result').textContent();
    console.log('  넘기 결과:', r.slice(0, 140));
    const [clean, total] = (await page.getByTestId('break-clean').textContent()).split('/').map(Number);
    ok(total >= 6, `넘은 횟수 ${total} (7초에 약 11번)`);
    ok(clean >= 2 && clean < total, `깨끗하게 ${clean}/${total} (0.06초 끊김만 깨끗)`);
    ok(/끽 소리 \d+번/.test(r), '끽 소리 찾음');
    await page.screenshot({ path: 'scripts/shot-break-result.png', fullPage: true });
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 10. 못갖춘마디 0 · 악보에 적힌 템포 · 그리기 구간 ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await tab(page, 'score');
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-pickup.musicxml'));
    await page.getByTestId('score-view').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('from').inputValue()) === '0', `못갖춘마디 0 부터 시작 (${await page.getByTestId('from').inputValue()})`);
    ok((await page.getByTestId('play-bpm').inputValue()) === '66', `악보에 적힌 템포로 (${await page.getByTestId('play-bpm').inputValue()})`);
    const all = await page.locator('[data-testid=osmd] .vf-stavenote').count();
    await page.getByTestId('to').fill('0');
    await page.waitForTimeout(1500);
    const one = await page.locator('[data-testid=osmd] .vf-stavenote').count();
    ok(all >= 7 && one === 1, `0번 마디만 그리기 (전체 ${all}음 → ${one}음)`);
    await page.getByTestId('from').fill('2');
    await page.getByTestId('to').fill('3');
    await page.waitForTimeout(1500);
    ok((await page.locator('[data-testid=osmd] .vf-stavenote').count()) === 3, `2~3마디만 그리기 (${await page.locator('[data-testid=osmd] .vf-stavenote').count()}음)`);
    await page.getByRole('button', { name: '◀ 목록' }).click();
    ok(/스모크 못갖춘마디/.test(await page.locator('.page').textContent()), '목록에 새 악보 (XML 없이 목록)');
    // 트릴·모르덴트·턴·꾸밈음 재생 (채점 음은 꾸밈음 빼고 5개)
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-orn.musicxml'));
    await page.getByTestId('score-view').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1200);
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(600);
    ok(/ 5음/.test(await page.locator('.range-row').textContent()), `꾸밈음은 채점 음에서 빼기 (${(await page.locator('.range-row').textContent()).trim()})`);
    await page.getByTestId('play-bpm').fill('120');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(4500);
    ok(!/불러오지 못해서/.test(await page.locator('.page').textContent()), '트릴·꾸밈음 재생');
    await page.getByTestId('play-toggle').click().catch(() => {});
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 11. ♯·♭ 형광펜 (D장조 악보: C♯5 하나) ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await tab(page, 'score');
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-score.musicxml'));
    await page.waitForTimeout(1500);
    await page.getByTestId('to').fill('2');
    await page.waitForTimeout(1200);
    await page.getByTestId('acc-toggle').click();
    await page.waitForTimeout(500);
    ok((await page.getByTestId('acc-hl').count()) === 1, `C♯5 에 형광펜 (${await page.getByTestId('acc-hl').count()})`);
    ok((await page.getByTestId('acc-chip').allTextContents()).join() === 'C♯', '형광펜 칩 C♯');
    await page.getByTestId('osmd').scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'scripts/shot-acc.png', fullPage: true });
    await page.getByTestId('acc-chip').click();
    await page.waitForTimeout(300);
    ok((await page.getByTestId('acc-hl').count()) === 0, '칩을 누르면 그 음은 빼기');
    await page.getByTestId('acc-chip').click();
    await page.getByTestId('zoom-in').click().catch(() => page.getByRole('button', { name: '악보 크게' }).click());
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('acc-hl').count()) === 1, '확대해도 형광펜 따라감');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 12. 장·단음계 악보 + 조 바꾸기 ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    await tab(page, 'score');
    await page.getByTestId('open-exercises').click();
    await page.getByTestId('sheet-major').click();
    await page.getByTestId('sheet-Eb').click();
    await page.getByTestId('sheet-nav').waitFor({ timeout: 5000 });
    await page.waitForTimeout(1200);
    ok(/E♭장조 음계 · 2옥타브/.test(await page.locator('.score-title').textContent()), `음계 악보 E♭장조 (${await page.locator('.score-title').textContent()})`);
    await page.getByTestId('acc-toggle').click();
    await page.getByTestId('len-chips').getByRole('button', { name: '16마디' }).click();
    await page.waitForTimeout(800);
    ok((await page.getByTestId('acc-chip').allTextContents()).join(' ') === 'B♭ E♭ A♭', `E♭장조 형광펜 칩 (${(await page.getByTestId('acc-chip').allTextContents()).join(' ')})`);
    await page.screenshot({ path: 'scripts/shot-sheet.png', fullPage: true });
    await page.getByTestId('sheet-next').click();
    await page.waitForFunction(() => /A♭장조/.test(document.querySelector('.score-title')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
    ok(/A♭장조/.test(await page.locator('.score-title').textContent()), '다음 조 → A♭장조');
    await page.getByTestId('sheet-relative').click();
    await page.waitForFunction(() => /F단조/.test(document.querySelector('.score-title')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
    ok(/F단조 \(.+\) 음계/.test(await page.locator('.score-title').textContent()), `나란한단조 → F단조 (${await page.locator('.score-title').textContent()})`);
    await page.getByRole('button', { name: '◀ 목록' }).click();
    await page.getByRole('button', { name: '◀ 목록' }).click();
    // 내 악보 조 바꾸기 (D장조 → E장조)
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-score.musicxml'));
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('key-name').textContent()) === 'D장조', '조 바꾸기: 원래 D장조');
    await page.getByTestId('key-up').click();
    await page.getByTestId('key-up').click();
    await page.waitForTimeout(1500);
    ok((await page.getByTestId('key-name').textContent()) === 'E장조', `+2 → E장조 (${await page.getByTestId('key-name').textContent()})`);
    ok(await page.getByTestId('edit-toggle').isDisabled(), '옮긴 동안 음 고치기 끔');
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(1500);
    await page.getByTestId('play-toggle').click().catch(() => {});
    await page.getByTestId('key-save').click();
    ok(await seen(page.getByTestId('key-msg')), '이 조로 새 악보 저장');
    await page.getByTestId('key-reset').click();
    await page.waitForTimeout(500);
    ok((await page.getByTestId('key-name').textContent()) === 'D장조', '원래 조로');
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.join(' | ')}`);
    await browser.close();
  }

  // ── 13. 전체 화면 ──
  {
    const { browser, page, errors } = await launch('bb466.wav');
    ok(await seen(page.getByTestId('fullscreen-toggle')), '전체 화면 버튼');
    await page.getByTestId('fullscreen-toggle').click();
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => !!document.fullscreenElement), '누르면 전체 화면');
    ok(/나가기/.test(await page.getByTestId('fullscreen-toggle').getAttribute('aria-label')), '버튼이 나가기로 바뀜');
    await page.getByTestId('fullscreen-toggle').click();
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => !document.fullscreenElement), '다시 누르면 나감');
    // 열 때 전체 화면: 설정 켜고 다시 연 뒤 첫 터치
    await page.getByRole('button', { name: '설정' }).click();
    await page.getByTestId('fullscreen-setting').check();
    await page.waitForTimeout(500);
    await page.evaluate(() => document.exitFullscreen().catch(() => {}));
    await page.reload();
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => !document.fullscreenElement), '다시 열면 아직 아님 (터치 전)');
    await tab(page, 'tuner');
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => !!document.fullscreenElement), '첫 터치에 전체 화면');
    // 재생 중에 꺼진 것처럼: 표시를 남기고 다시 열기 → 알림 → 가벼운 모드
    // (다시 열 때 pagehide 가 표시를 지우므로, 새로 열리는 순간에 표시를 넣음 — 실제로 꺼지면 pagehide 가 안 옴)
    await page.addInitScript(() => { if (!sessionStorage.getItem('fake-crash')) { sessionStorage.setItem('fake-crash', '1'); localStorage.setItem('clarinet-busy', JSON.stringify({ kinds: ['play'], at: Date.now() })); } });
    await page.reload();
    ok(await seen(page.getByTestId('crash-note')), '지난번 재생 중 꺼짐 알림');
    await page.getByTestId('crash-lite').click();
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.documentElement.classList.contains('lite')), '가벼운 모드 켜짐');
    await page.reload();
    await page.waitForTimeout(800);
    ok(!(await page.getByTestId('crash-note').count()), '정상으로 다시 열면 알림 없음');
    ok(await page.evaluate(() => document.documentElement.classList.contains('lite')), '가벼운 모드 기억');
    await tab(page, 'score');
    await page.getByTestId('score-file').setInputFiles(path.resolve('scripts/test-score.musicxml'));
    await page.waitForTimeout(1500);
    await page.getByTestId('play-bpm').fill('200');
    await page.getByTestId('play-toggle').click();
    await page.waitForTimeout(1200);
    ok(await page.evaluate(() => !!localStorage.getItem('clarinet-busy')), '재생 중에는 표시');
    await page.waitForTimeout(4000);
    ok(await page.evaluate(() => !localStorage.getItem('clarinet-busy')), '재생 끝나면 표시 지움');
    ok((await page.locator('[data-testid=osmd] svg').count()) >= 1, '가벼운 모드에서도 재생·악보 정상');
    await tab(page, 'tuner');
    await page.getByTestId('mic').click();
    await page.waitForTimeout(2500);
    const lc = num(await page.getByTestId('cents').textContent());
    ok((await page.getByTestId('note').textContent()) === 'C5' && Math.abs(lc - 20) <= 3, `가벼운 모드 튜너 C5 ${lc} (기대 +20)`);
    await page.getByTestId('mic').click();
    const m = await (await fetch(URL + 'manifest.webmanifest')).json();
    ok(m.display === 'fullscreen' && m.display_override?.[0] === 'fullscreen', `설치한 앱은 전체 화면 (${m.display})`);
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
