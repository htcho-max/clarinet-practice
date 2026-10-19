import { useGear, setCurrentGear, addGear, GEAR } from '../state/useGear';

/** 지금 쓰는 리드(플룻은 헤드조인트 위치) 고르기. 롱톤·텅잉·넘기·채점 기록에 함께 남음 */
export function GearPicker() {
  const { list, current } = useGear();
  const live = list.filter((g) => !g.retired);
  async function onChange(v: string) {
    if (v === 'new') {
      const label = prompt(`새 ${GEAR.one} 이름 (${GEAR.labelExample})`, `#${list.length + 1}`);
      if (label === null) return;
      const detail = prompt(`${GEAR.detail} (${GEAR.example}, 비워도 돼요)`, '') ?? '';
      await addGear(label, detail);
      return;
    }
    await setCurrentGear(v ? Number(v) : null);
  }
  return (
    <div className="gear-picker" data-testid="gear-picker">
      <span className="small muted">{GEAR.name}</span>
      <select value={current ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={GEAR.name} data-testid="gear-select">
        <option value="">{GEAR.none}</option>
        {live.map((g) => <option key={g.id} value={g.id}>{g.label}{g.detail ? ` · ${g.detail}` : ''}</option>)}
        <option value="new">＋ 새 {GEAR.one}…</option>
      </select>
    </div>
  );
}
