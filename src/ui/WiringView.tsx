import { ZONES, type AppConfig } from '../model/types';
import { loopsOfZone, thermostatStatus, type SimState } from '../sim/engine';
import { ka } from '../i18n/ka';
import { ROOM_COLOR } from './util';

interface Props {
  cfg: AppConfig;
  state: SimState;
  select: (id: string) => void;
  selected: string | null;
}

/** Generic 8-zone wiring-centre close-up (user's description; terminal labels assumed). */
export function WiringView({ cfg, state, select, selected }: Props) {
  const relay = state.controller.ta1Closed;
  const anyZone = ZONES.some((z) => state.controller.zoneOut[z]);
  const comp = (id: string) => ({
    'data-click': id,
    onClick: () => select(id),
    role: 'button' as const,
    tabIndex: 0,
    className: 'comp' + (selected === id ? ' is-selected' : ''),
  });
  const zx = (i: number) => 250 + i * 88;
  const maxOn = Math.max(0, ...ZONES.map((z) => (state.controller.zoneOut[z] ? state.controller.zoneOnS[z] : 0)));
  return (
    <div className="view-wrap">
      <svg viewBox="0 0 1000 640" className="wiring-view" data-testid="wiring-view">
        <text x={20} y={26} fontSize={16} fontWeight={700}>8-ზონიანი გაყვანილობის ცენტრი — ზოგადი მოდელი (გადაამოწმეთ მწარმოებლის ინსტრუქციით)</text>
        <g {...comp('controller')}>
          <rect x={200} y={200} width={760} height={230} rx={10} className="wc-board" />
          <text x={210} y={220} fontSize={12} className="t-dim">PCB · 220V · 15A ფუზი · PE</text>
        </g>
        {/* mains */}
        <g {...comp('fuse')}>
          <rect x={30} y={250} width={130} height={110} rx={6} className="term-block" />
          <text x={95} y={270} fontSize={12} textAnchor="middle" fontWeight={700}>კვება 220V</text>
          {['L', 'N', 'PE'].map((t, i) => (
            <g key={t}>
              <rect x={45 + i * 38} y={282} width={30} height={22} className="term term-on" />
              <text x={60 + i * 38} y={298} fontSize={11} textAnchor="middle">{t}</text>
            </g>
          ))}
          <rect x={55} y={318} width={80} height={22} rx={10} fill="#fff3bf" stroke="#b08900" />
          <text x={95} y={334} fontSize={11} textAnchor="middle">ფუზი 15A</text>
          <line x1={160} y1={300} x2={200} y2={300} stroke="#333" strokeWidth={3} />
        </g>

        {/* zones */}
        {Array.from({ length: 8 }, (_, i) => {
          const z = ZONES[i];
          const used = !!z;
          const out = used && state.controller.zoneOut[z];
          const sig = used && state.rooms[z].calling;
          const nAct = used ? loopsOfZone(cfg, z).length : 0;
          const st = used ? thermostatStatus(state, cfg, z) : 'off';
          return (
            <g key={i} data-testid={`zone-${i + 1}`} data-out={out ? '1' : '0'}>
              <text x={zx(i) + 36} y={245} fontSize={12} textAnchor="middle" fontWeight={700}>Z{i + 1}</text>
              {/* input terminals */}
              {['L', 'N', 'სიგ'].map((t, k) => (
                <g key={t}>
                  <rect x={zx(i) + k * 25} y={252} width={22} height={20} className={'term' + (used && (k !== 2 || sig) ? ' term-on' : '')} />
                  <text x={zx(i) + 11 + k * 25} y={266} fontSize={k === 2 ? 8 : 10} textAnchor="middle">{t}</text>
                </g>
              ))}
              <text x={zx(i) + 36} y={376} fontSize={8} textAnchor="middle" className="t-dim">აქტ. წყვილი</text>
              {/* actuator output pair */}
              {[0, 1].map((k) => (
                <g key={k}>
                  <rect x={zx(i) + 12 + k * 25} y={380} width={22} height={20} className={'term' + (out ? ' term-on' : '')} />
                  <text x={zx(i) + 23 + k * 25} y={394} fontSize={10} textAnchor="middle">A~</text>
                </g>
              ))}
              <circle cx={zx(i) + 36} cy={330} r={9} fill={out ? '#f59f00' : '#dee2e6'} stroke="#555" />
              <text x={zx(i) + 36} y={355} fontSize={9} textAnchor="middle">{out ? 'ON' : used ? 'OFF' : 'თავისუფ.'}</text>
              {used && (
                <>
                  {/* thermostat cable */}
                  <g {...comp('thermostat:' + z)}>
                    <rect x={zx(i) - 4} y={60} width={80} height={60} rx={8} className={`thermo-card thermo-${st}`} stroke={ROOM_COLOR[z]} />
                    <text x={zx(i) + 36} y={80} fontSize={10} textAnchor="middle" fontWeight={700}>{cfg.roomNames[z].slice(0, 12)}</text>
                    <text x={zx(i) + 36} y={96} fontSize={10} textAnchor="middle">Beok 220V</text>
                    <text x={zx(i) + 36} y={112} fontSize={10} textAnchor="middle">{ka.status[st]}</text>
                    <line x1={zx(i) + 11} y1={120} x2={zx(i) + 11} y2={252} className={'core core-l' + (cfg.thermostats[z].enabled ? ' is-live' : '')} />
                    <line x1={zx(i) + 36} y1={120} x2={zx(i) + 36} y2={252} className={'core core-n' + (cfg.thermostats[z].enabled ? ' is-live' : '')} />
                    <line x1={zx(i) + 61} y1={120} x2={zx(i) + 61} y2={252} className={'core core-s' + (sig ? ' is-live flow-anim' : '')} data-testid={`sig-${z}`} data-live={sig ? '1' : '0'} />
                    <text x={zx(i) + 36} y={140} fontSize={8} textAnchor="middle" className="t-dim">1=L 2=N 3=სიგ. (?)</text>
                  </g>
                  {/* actuators in parallel */}
                  <g {...comp('actuator:' + loopsOfZone(cfg, z)[0])}>
                    <line x1={zx(i) + 23} y1={400} x2={zx(i) + 23} y2={470} className={'core core-l' + (out ? ' is-live' : '')} />
                    <line x1={zx(i) + 48} y1={400} x2={zx(i) + 48} y2={470} className={'core core-n' + (out ? ' is-live' : '')} />
                    {loopsOfZone(cfg, z).map((id, k) => (
                      <g key={id}>
                        <rect x={zx(i) + 6 + (k % 3) * 22} y={475 + Math.floor(k / 3) * 26} width={20} height={22} rx={4} className={`act-head act-${state.loops[id]?.act.phase ?? 'closed'}`} />
                        <text x={zx(i) + 16 + (k % 3) * 22} y={490 + Math.floor(k / 3) * 26} fontSize={7} textAnchor="middle">{id.slice(1)}</text>
                      </g>
                    ))}
                    <text x={zx(i) + 36} y={570} fontSize={9} textAnchor="middle">{nAct} აქტ. ≈{nAct * 2}–{nAct * 3} W</text>
                    {nAct >= 5 && <text x={zx(i) + 36} y={584} fontSize={9} textAnchor="middle" className="t-warn">⚠ ზონის ლიმიტი?</text>}
                  </g>
                </>
              )}
            </g>
          );
        })}

        {/* boiler relay */}
        <g {...comp('relay')} data-testid="relay" data-closed={relay ? '1' : '0'}>
          <rect x={30} y={420} width={150} height={120} rx={6} className="term-block" />
          <text x={105} y={440} fontSize={12} textAnchor="middle" fontWeight={700}>ქვაბის რელე</text>
          {['NO', 'COM', 'NC'].map((t, k) => (
            <g key={t}>
              <rect x={42 + k * 44} y={452} width={38} height={22} className={'term' + (relay && t !== 'NC' ? ' term-on' : '')} />
              <text x={61 + k * 44} y={467} fontSize={10} textAnchor="middle">{t}</text>
            </g>
          ))}
          <line x1={61} y1={490} x2={relay ? 105 : 92} y2={relay ? 490 : 478} stroke="#222" strokeWidth={3} />
          <circle cx={105} cy={490} r={3} />
          <text x={105} y={515} fontSize={10} textAnchor="middle">{relay ? 'COM–NO დაკეტილი' : 'ღია'}</text>
          <text x={105} y={530} fontSize={9} textAnchor="middle" className="t-warn">მხოლოდ მშრალი კონტაქტი</text>
          <polyline points="61,540 61,610 400,610" className={'wire wire-ta1' + (relay ? ' wire-live ta1-closed flow-anim' : '')} data-testid="ta1-wire" />
          <text x={410} y={614} fontSize={11} fontWeight={700}>→ Ariston TA1 (ჯამპერი მოხსნილი) · 230V არასოდეს TA1-ზე</text>
        </g>
        {/* DIP */}
        <g {...comp('dip')}>
          <rect x={30} y={130} width={150} height={90} rx={6} className="term-block" />
          <text x={105} y={150} fontSize={12} textAnchor="middle" fontWeight={700}>DIP დაყოვნება</text>
          {[0, 120, 300].map((v, k) => (
            <g key={v}>
              <rect x={48 + k * 40} y={158} width={18} height={26} fill="#fff" stroke="#495057" />
              <rect x={51 + k * 40} y={cfg.sim.relayDelayS === v ? 160 : 172} width={12} height={10} fill={cfg.sim.relayDelayS === v ? '#2b8a3e' : '#adb5bd'} />
              <text x={57 + k * 40} y={196} fontSize={9} textAnchor="middle">{v / 60} წთ</text>
            </g>
          ))}
          <text x={105} y={212} fontSize={9} textAnchor="middle">
            {anyZone ? `ათვლა ${Math.min(cfg.sim.relayDelayS, Math.round(maxOn))}/${cfg.sim.relayDelayS} წმ` : 'მოლოდინი'}
          </text>
        </g>
        {/* pump output */}
        <g {...comp('pumpout')}>
          <rect x={860} y={130} width={110} height={60} rx={6} className="term-block" />
          <text x={915} y={150} fontSize={11} textAnchor="middle" fontWeight={700}>ტუმბო L1/N1</text>
          <text x={915} y={172} fontSize={10} textAnchor="middle" className={cfg.sim.pumpOutputEnabled ? '' : 't-dim'}>
            {cfg.sim.pumpOutputEnabled ? (anyZone ? 'ჩართ. (230V)' : 'გამორთ.') : 'არ გამოიყენება'}
          </text>
        </g>
      </svg>
      <div className="view-notes">
        <p className="t-warn">⚠ ზოგადი მოდელი: ძარღვი 1 = L, 2 = N (თერმოსტატის კვება), 3 = თერმოსტატის სიგნალი → ზონის კლემა. ოთახის ყველა აქტუატორი პარალელურად — ზონის აქტუატორის წყვილზე. 4 ოთახი იყენებს 8-დან 4 ზონას. კლემების წარწერები და ზონის დენის ლიმიტი დაუდასტურებელია.</p>
        <p>ჰოლი/გარდერობი მიერთებულია: {cfg.roomNames[cfg.owners.hall]} / {cfg.roomNames[cfg.owners.wardrobe]} ზონაზე. მონტაჟი — მხოლოდ კვალიფიციური ელექტრიკოსი; ქვაბის მიერთება — Ariston-ის სერვისის ტექნიკოსი. ეს არ არის მონტაჟის ინსტრუქცია.</p>
      </div>
    </div>
  );
}
