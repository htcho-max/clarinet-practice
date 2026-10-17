// 스모크 테스트용 가짜 마이크 소리 (클라리넷형 홀수 배음, 48kHz). 모두 실음(콘서트 피치)
//  bb466.wav    : 실음 B♭4 +20센트 계속 = B♭ 클라리넷 악보음 C5 +20 (튜너·운지)
//  phrases.wav  : 악보음 A4 B4(+12) C#5(-6) D5 | B4 D5 → 실음은 2반음 아래 (악보 채점·음정 그래프)
//  longtone.wav : 1초 쉼 → 악보음 G4(실음 F4) +5센트 6초, 점점 크게 → 1.5초 쉼 (롱톤)
//  tongue.wav   : 악보음 C5 를 0.25초마다 혀로 끊기 (텅잉)
import { writeFileSync } from 'node:fs';
const sr = 48000, H = [1, 0.08, 0.55, 0.05, 0.32, 0.04, 0.2, 0.03, 0.12];
const f = (m, c = 0) => 442 * 2 ** ((m - 69) / 12 + c / 1200); // 앱 기본 A=442 (뷔페 B12)
const W = (m) => m - 2; // 악보음 → 실음 (B♭ 클라리넷)

function write(name, dur, freqAt, ampAt = () => 1) {
  const n = Math.floor(sr * dur), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const fr = freqAt(t);
    let v = 0;
    if (fr) { ph += (2 * Math.PI * fr) / sr; H.forEach((a, k) => { v += a * Math.sin((k + 1) * ph); }); }
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * 0.12 * ampAt(t))) * 32767), 44 + i * 2);
  }
  writeFileSync(`scripts/${name}`, buf);
}

write('bb466.wav', 10, () => f(70, 20));

// [시작, 끝, 주파수함수] (악보음)
const plan = [
  [0.0, 0.6, () => f(W(69))], [0.6, 1.2, () => f(W(71), 12)], [1.2, 1.8, () => f(W(73), -6)], [1.8, 2.4, () => f(W(74))],
  [2.6, 3.4, () => f(W(71))], [3.4, 4.1, () => f(W(74))],
];
write('phrases.wav', 4.4, (t) => { const p = plan.find(([a, b]) => t >= a && t < b); return p ? p[2](t) : null; });

write('longtone.wav', 8.5, (t) => (t >= 1 && t < 7 ? f(W(67), 5) : null), (t) => 0.35 + 0.65 * Math.min(1, Math.max(0, (t - 1) / 6)));

// 텅잉: 0.25초마다 30ms 끊김
write('tongue.wav', 12, () => f(W(72)), (t) => ((t % 0.25) < 0.03 ? 0 : 1));

// 플룻: 실음 A4 +20센트 (플룻은 이조 없음), 기음이 강한 음색
{
  const n = Math.floor(sr * 10), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const fr = f(69, 20), HF = [1, 0.25, 0.1, 0.05];
  for (let i = 0; i < n; i++) { let v = 0; HF.forEach((a, k) => { v += a * Math.sin(2 * Math.PI * fr * (k + 1) * i / sr); }); v += (Math.random() - 0.5) * 0.02; buf.writeInt16LE(Math.round(v * 0.2 * 32767), 44 + i * 2); }
  writeFileSync('scripts/fl_a4.wav', buf);
}
