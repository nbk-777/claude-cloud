import type { AppConfig } from '../model/types';
import type { SimState } from '../sim/engine';
import { ka, SRC } from '../i18n/ka';
import { fmt, waterColor } from './util';
import { BoilerFrontDevice, ShowerDevice } from './devices';

interface Props {
  cfg: AppConfig;
  state: SimState;
  select: (id: string) => void;
  selected: string | null;
}

// Coordinates in px (viewBox 0 0 1000 720). Layout loosely follows the manual's water-circuit
// diagram (GB p.16): heat exchanger top, hydraulic group bottom, connections A–E along the bottom.
const PORT_X: Record<string, number> = { A: 330, B: 400, C: 470, D: 540, E: 610 };

export function BoilerView({ cfg, state, select, selected }: Props) {
  const b = state.boiler;
  const ch = b.pumpOn && b.diverter === 'CH';
  const dhw = b.mode === 'dhw';
  const hot = waterColor(b.flowC);
  const cool = waterColor(b.returnC);
  const sel = (id: string) => (selected === id ? ' is-selected' : '');
  const comp = (id: string) => ({ 'data-click': id, onClick: () => select(id), role: 'button' as const, tabIndex: 0, className: 'comp' + sel(id) });
  const cut = cfg.display.boilerCutaway;

  return (
    <div className="view-wrap">
      <svg viewBox="0 0 1310 730" className="boiler-view" data-testid="boiler-view" data-mode={b.mode}>
        <text x={20} y={22} fontSize={14} fontWeight={700}>წინა პანელი</text>
        <g transform="translate(20,60)">
          <BoilerFrontDevice mode={b.mode} flowC={b.flowC} burnerOn={b.burnerOn} chSetpointC={cfg.sim.chSetpointC} chRange={cfg.sim.chRange} ta1Closed={state.controller.ta1Closed} fault={!!b.fault} pumpOn={b.pumpOn} onPart={select} />
        </g>
        <text x={20} y={480} fontSize={11} className="t-dim">* წნევა არ არის სიმულირებული</text>
        <g transform="translate(1180,600)" data-click="shower" onClick={() => select('shower')} className="comp">
          <ShowerDevice on={state.dhw.showerOn} hot={state.dhw.kW > 0} />
          <text x={-10} y={100} fontSize={11}>შხაპი (სააბაზანო)</text>
        </g>
        <g transform="translate(290,0)">
        <defs>
          <marker id="barrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {/* thermo-cabinet */}
        <g {...comp('cabinet')}>
          <rect x={200} y={30} width={560} height={600} rx={8} className="cab-outline" />
          <text x={215} y={55} fontSize={15} fontWeight={700}>თერმო-კარადა · მარცხენა აივანი</text>
          <text x={215} y={75} fontSize={12} className="t-warn">⚠ +5 °C მინ. გარემო {SRC} · ყინვა / კონდენსატი / ვენტილაცია / საკვამური — ღია საკითხი</text>
        </g>
        {/* boiler casing */}
        <g {...comp('boiler')}>
          <rect x={270} y={95} width={420} height={440} rx={14} className={cut ? 'casing-cut' : 'casing'} />
          <text x={480} y={122} fontSize={16} textAnchor="middle" fontWeight={700}>Ariston Genus ONE 24 — {ka.mode[b.mode]}</text>
        </g>
        {cut && (
          <g>
            {/* heat exchanger + burner */}
            <g {...comp('hx')}>
              <rect x={380} y={140} width={200} height={110} rx={10} className="hx" />
              <text x={480} y={160} fontSize={12} textAnchor="middle">სანთურა + კონდენსაციური თბომცვლელი</text>
              <path d="M450,235 Q445,195 480,175 Q515,195 510,235 Z" className={'flame-big' + (b.burnerOn ? ' on' : '')} />
              <text x={480} y={268} fontSize={11} textAnchor="middle">{b.burnerOn ? `🔥 ${fmt(b.burnerKW)} kW*` : 'ჩამქრალი'}</text>
            </g>
            {/* internal pipes: CH circuit */}
            <polyline points="330,560 330,470 360,470 360,250 380,250" className={'ipipe' + (ch ? ' flow-anim ipipe-flow' : '')} stroke={ch ? hot : '#d08b80'} />
            <polyline points="610,560 610,420 560,420" className={'ipipe' + (ch || dhw ? ' flow-anim ipipe-flow' : '')} stroke={cool} />
            <polyline points="560,420 520,420 520,380" className={'ipipe' + (ch || dhw ? ' flow-anim ipipe-flow' : '')} stroke={cool} />
            <polyline points="580,200 640,200 640,330" className={'ipipe' + (ch || dhw ? ' flow-anim ipipe-flow' : '')} stroke={hot} />
            {/* DHW circuit */}
            <polyline points="540,560 540,500 460,500 460,460" className={'ipipe' + (dhw ? ' flow-anim ipipe-flow' : '')} stroke="#3aa0ff" />
            <polyline points="430,460 400,460 400,560" className={'ipipe' + (dhw ? ' flow-anim ipipe-flow' : '')} stroke={dhw ? '#ff3b8d' : '#e9a3c2'} />

            {/* pump */}
            <g {...comp('pump')}>
              <circle cx={520} cy={355} r={26} className="pump-body" />
              <g className={'rotor' + (b.pumpOn ? ' spinning' : '')} style={{ transformOrigin: '520px 355px' }}>
                <path d="M520,335 L526,355 L520,375 L514,355 Z M500,355 L520,349 L540,355 L520,361 Z" fill="#1c3d5a" />
              </g>
              <text x={555} y={350} fontSize={11}>ტუმბო {b.pumpOn ? 'ON' : 'OFF'}</text>
              <text x={555} y={364} fontSize={10} className="t-dim">+ ავტ. ჰაერის გამშვები</text>
            </g>
            {/* diverter */}
            <g {...comp('diverter')} data-testid="diverter" data-pos={b.diverter}>
              <rect x={330} y={420} width={60} height={40} rx={6} className="valve" />
              <line x1={360} y1={440} x2={b.diverter === 'CH' ? 360 : 385} y2={b.diverter === 'CH' ? 422 : 440} stroke="#222" strokeWidth={4} />
              <text x={300} y={415} fontSize={11}>სამსვლიანი: {b.diverter === 'CH' ? 'გათბობა' : 'ცსწ'}</text>
            </g>
            {/* plate HX (secondary) */}
            <g {...comp('hx')}>
              <rect x={430} y={440} width={30} height={40} className="plate" />
              <text x={410} y={492} fontSize={10}>მეორადი თბომც.</text>
            </g>
            {/* flow switch */}
            <g {...comp('flowswitch')}>
              <circle cx={540} cy={520} r={10} className={'fs' + (state.dhw.flowSwitch ? ' on' : '')} />
              <text x={555} y={524} fontSize={10}>ცსწ ნაკადის სენსორი {state.dhw.flowSwitch ? '●' : '○'}</text>
            </g>
            {/* filter */}
            <g {...comp('filter')}>
              <rect x={598} y={450} width={24} height={30} className="filter" />
              <text x={630} y={470} fontSize={10}>ფილტრი</text>
            </g>
            {/* expansion vessel */}
            <g {...comp('vessel')}>
              <rect x={620} y={150} width={50} height={120} rx={22} className="vessel" />
              <text x={645} y={285} fontSize={10} textAnchor="middle">გაფ. ავზი 8 ლ</text>
              <text x={645} y={298} fontSize={9} textAnchor="middle" className="t-dim">1 ბარი {SRC}</text>
            </g>
            {/* safety, pressure, filling, bypass */}
            <g {...comp('safety')}>
              <rect x={290} y={300} width={40} height={24} className="valve" />
              <text x={290} y={296} fontSize={10}>დამცავი 3 ბარი</text>
            </g>
            <g {...comp('pressure')}>
              <circle cx={310} cy={360} r={11} className="gauge" />
              <text x={290} y={385} fontSize={10}>წნევის სენსორი</text>
            </g>
            <g {...comp('filling')}>
              <rect x={470} y={505} width={36} height={14} className="valve" />
              <text x={465} y={535} fontSize={10}>შემავსებელი (G)</text>
            </g>
            <g {...comp('bypass')}>
              <line x1={420} y1={380} x2={500} y2={380} strokeDasharray="5 4" stroke="#555" strokeWidth={3} />
              <text x={400} y={400} fontSize={10}>ავტ. ბაიპასი (როლი — დაუდასტ.)</text>
            </g>
          </g>
        )}

        {/* bottom connections */}
        {(['A', 'B', 'C', 'D', 'E'] as const).map((k) => (
          <g key={k} {...comp('pipe' + k)}>
            <rect x={PORT_X[k] - 14} y={540} width={28} height={22} className="port" />
            <text x={PORT_X[k]} y={556} fontSize={13} textAnchor="middle" fontWeight={700}>{k}</text>
          </g>
        ))}
        <g {...comp('pipeF')}>
          <rect x={650} y={540} width={24} height={20} className="port port-ctx" />
          <text x={662} y={555} fontSize={11} textAnchor="middle">F</text>
        </g>
        <g {...comp('pipeH')}>
          <rect x={680} y={540} width={24} height={20} className="port port-ctx" />
          <text x={692} y={555} fontSize={11} textAnchor="middle">H</text>
        </g>
        <g {...comp('pipeI')}>
          <rect x={280} y={540} width={24} height={20} className="port port-ctx" />
          <text x={292} y={555} fontSize={11} textAnchor="middle">I</text>
        </g>

        {/* external pipes */}
        <g {...comp('pipeA')}>
          <polyline points="330,562 330,640 120,640 120,690" className={'xpipe' + (ch ? ' flow-anim xpipe-flow' : '')} stroke={ch ? hot : '#d08b80'} markerEnd="url(#barrow)" />
          <text x={20} y={660} fontSize={12}>A → კოლექტორი (მიწოდება) {fmt(b.flowC)}°C</text>
        </g>
        <g {...comp('pipeE')}>
          <polyline points="60,690 60,620 610,620 610,564" className={'xpipe' + (ch ? ' flow-anim xpipe-flow' : '')} stroke={ch ? cool : '#7fa6d8'} markerEnd="url(#barrow)" />
          <text x={20} y={610} fontSize={12}>E ← კოლექტორიდან (დაბრუნება) {fmt(b.returnC)}°C</text>
        </g>
        <g {...comp('pipeB')}>
          <polyline points="400,562 400,600 880,600 880,662" className={'xpipe' + (dhw ? ' flow-anim xpipe-flow' : '')} stroke={dhw ? '#ff3b8d' : '#e9a3c2'} markerEnd="url(#barrow)" />
          <text x={700} y={592} fontSize={12}>B → შხაპი {dhw ? `${fmt(state.dhw.outC)}°C` : ''}</text>
        </g>
        <g {...comp('pipeD')}>
          <polyline points="940,690 940,660 540,660 540,564" className={'xpipe' + (dhw ? ' flow-anim xpipe-flow' : '')} stroke="#3aa0ff" markerEnd="url(#barrow)" />
          <text x={790} y={655} fontSize={12}>D ← ცივი წყალი {cfg.sim.coldWaterC}°C</text>
        </g>
        <g {...comp('pipeC')}>
          <polyline points="470,562 470,700" className="xpipe gas" />
          <text x={478} y={712} fontSize={11} className="t-dim">C გაზი — მხოლოდ კონტექსტი</text>
        </g>
        <g {...comp('pipeI')}>
          <polyline points="292,562 292,590 230,590 230,700" className="xpipe cond" />
          <text x={140} y={712} fontSize={11} className="t-warn">I კონდენსატი ❄ გაყინვის რისკი</text>
        </g>

        {/* terminal block */}
        <g {...comp('terminals')}>
          <rect x={790} y={120} width={190} height={170} rx={6} className="term-block" />
          <text x={885} y={140} fontSize={13} textAnchor="middle" fontWeight={700}>{ka.boilerView.terminals}</text>
          {[
            ['TA1', state.controller.ta1Closed ? 'დაკეტილი ●' : 'ღია ○'],
            ['FLOOR/TA2', cfg.sim.floorSafetyInstalled ? (b.fault ? 'ღია ✕ (116)' : 'დაკეტილი ●') : '—'],
            ['BUS', '—'],
            ['SE', '—'],
          ].map(([k, v], i) => (
            <g key={k}>
              <rect x={800} y={152 + i * 32} width={70} height={24} className={'term' + (k === 'TA1' && state.controller.ta1Closed ? ' term-on' : '') + (k === 'FLOOR/TA2' && b.fault ? ' term-fault' : '')} />
              <text x={835} y={168 + i * 32} fontSize={11} textAnchor="middle" fontWeight={700}>{k}</text>
              <text x={878} y={168 + i * 32} fontSize={11}>{v}</text>
            </g>
          ))}
          <text x={800} y={300} fontSize={10} className="t-dim">12V DC, მხოლოდ volt-free {SRC}</text>
        </g>
        <g {...comp('relay')}>
          <polyline points="980,170 995,170 995,20 760,20" className={'wire wire-ta1' + (state.controller.ta1Closed ? ' wire-live ta1-closed flow-anim' : '')} />
          <text x={770} y={14} fontSize={11}>← გაყვანილობის ცენტრი: რელე COM–NO (230V არასოდეს!)</text>
        </g>
        <g {...comp('floorstat')}>
          <rect x={150} y={540} width={40} height={18} className={'port' + (b.fault ? ' term-fault' : '')} />
          <text x={100} y={535} fontSize={10}>იატაკის დამცავი (არჩ.)</text>
        </g>
        </g>
      </svg>
      <div className="view-notes">
        <p>{ka.boilerView.orderNote}</p>
        <p>{ka.boilerView.variantNote}</p>
        <p>{ka.boilerView.noCombustion} {ka.boilerView.noInstall}</p>
        {b.mode === 'dhw' && <p className="t-warn">{ka.warnings.noFlowDhw}{state.dhw.limited ? ' · ' + ka.warnings.dhwLimited : ''}</p>}
      </div>
    </div>
  );
}
