export type TabId = 'today' | 'tuner' | 'fingering' | 'tone' | 'metronome' | 'score' | 'log';
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'today', label: '오늘', icon: '◎' },
  { id: 'tuner', label: '튜너', icon: '♮' },
  { id: 'fingering', label: '운지', icon: '⠿' },
  { id: 'tone', label: '롱톤', icon: '∿' },
  { id: 'metronome', label: '메트로놈', icon: '♩' },
  { id: 'score', label: '악보', icon: '♬' },
  { id: 'log', label: '기록', icon: '▦' },
];

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => onChange(t.id)} aria-current={t.id === tab} data-testid={`tab-${t.id}`}>
          <span className="tab-icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
