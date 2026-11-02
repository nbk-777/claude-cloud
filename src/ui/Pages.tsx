import { useRef, useState } from 'react';
import {
  ALT_ALLOCATION,
  clearMapping,
  defaultConfig,
  defaultLoops,
  exportConfig,
  importConfig,
  loopCountByRoom,
  reassignLoop,
  setLoopCrossing,
} from '../model/config';
import { ROOM_GEOMETRY, roomDrawnArea } from '../model/plan';
import { ROOMS, ZONES, isRoom, type AppConfig, type RoomId, type ZoneId } from '../model/types';
import { ka } from '../i18n/ka';
import {
  CHECKLIST,
  EQUIPMENT,
  MANUAL_FACTS,
  OPEN_ITEMS,
  PROTOTYPE_ASSUMPTIONS,
  SIM_LIMITATIONS,
  SOURCES,
  UNVERIFIED_DECISIONS,
  USER_FACTS,
} from '../data/reference';
import { ROOM_COLOR } from './util';

export function MappingPage({ cfg, setCfg }: { cfg: AppConfig; setCfg: (c: AppConfig) => void }) {
  const counts = loopCountByRoom(cfg.loops);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [pasted, setPasted] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const exportRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const roomOpt = (allowNone: boolean) => (
    <>
      {allowNone && <option value="">{ka.mapping.none}</option>}
      {ROOMS.map((r) => (
        <option key={r} value={r}>
          {cfg.roomNames[r]}
        </option>
      ))}
    </>
  );
  // Export is shown as copyable text (file downloads are blocked in some hosts).
  const copyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportConfig(cfg));
      setMsg({ ok: true, text: 'JSON დაკოპირდა' });
    } catch {
      exportRef.current?.select();
      setMsg({ ok: true, text: 'მონიშნულია — დააკოპირეთ Ctrl+C-ით' });
    }
  };
  const doImport = async (f: File) => importText(await f.text());
  const importText = (text: string) => {
    const r = importConfig(text, cfg);
    if (r.ok) {
      setCfg(r.config);
      setMsg({ ok: true, text: ka.mapping.importOk });
    } else setMsg({ ok: false, text: `${ka.mapping.importFail} ${r.errors.slice(0, 5).join('; ')}` });
  };
  return (
    <div className="page" data-testid="mapping-page">
      <h2>{ka.mapping.title}</h2>
      <p className={cfg.mappingVerified ? 't-ok' : 't-warn'}>{cfg.mappingVerified ? ka.warnings.mappingVerified : ka.warnings.mappingDemo}</p>
      <p className="small">{ka.mapping.invariant} {ka.plan.loopsNeedConfirm}</p>
      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={cfg.mappingVerified} onChange={(e) => setCfg({ ...cfg, mappingVerified: e.target.checked })} data-testid="verified" />
          {ka.mapping.verified}
        </label>
      </div>
      <div className="row wrap">
        <button onClick={() => setCfg(clearMapping(cfg))} data-testid="clear-mapping">{ka.mapping.clear}</button>
        <button onClick={() => setCfg({ ...cfg, loops: defaultLoops(), mappingVerified: false })}>{ka.mapping.reset} (6/3/2/1/1/1)</button>
        <button onClick={() => setCfg({ ...cfg, loops: defaultLoops(ALT_ALLOCATION), mappingVerified: false })}>ალტერნატივა მე-2 შეტყობინებიდან (6/3/2/2/0/1)</button>
        <button onClick={() => setShowExport(!showExport)} data-testid="export">{ka.mapping.export}</button>
        <button onClick={() => fileRef.current?.click()}>{ka.mapping.import} (ფაილი)</button>
        <input ref={fileRef} id="import-file" type="file" accept="application/json" hidden data-testid="import-file" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        {!confirmReset ? (
          <button onClick={() => setConfirmReset(true)}>ყველაფრის დემოზე დაბრუნება</button>
        ) : (
          <span className="row">
            ნამდვილად? ყველა პარამეტრი წაიშლება.
            <button className="primary" onClick={() => { setCfg(defaultConfig()); setConfirmReset(false); }}>დიახ, დაბრუნება</button>
            <button onClick={() => setConfirmReset(false)}>გაუქმება</button>
          </span>
        )}
      </div>
      {showExport && (
        <div className="io-box">
          <textarea id="export-json" ref={exportRef} readOnly value={exportConfig(cfg)} rows={6} />
          <button onClick={copyExport}>კოპირება</button>
        </div>
      )}
      <div className="io-box">
        <label htmlFor="import-json" className="small">ან ჩასვით JSON აქ და დააჭირეთ „იმპორტს“:</label>
        <textarea id="import-json" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={3} />
        <button onClick={() => importText(pasted)} disabled={!pasted.trim()}>{ka.mapping.import}</button>
      </div>
      {msg && <p className={msg.ok ? 't-ok' : 't-warn'} data-testid="import-msg">{msg.text}</p>}

      <h3>{ka.mapping.counts}</h3>
      <div className="row wrap">
        {ROOMS.map((r) => (
          <span key={r} className="chip" style={{ borderColor: ROOM_COLOR[r] }}>
            {cfg.roomNames[r]}: <b>{counts[r]}</b> ({(ROOM_GEOMETRY[r].planAreaM2 / Math.max(1, counts[r])).toFixed(1)} მ²/კონტ.)
          </span>
        ))}
        <span className="chip">{ka.manifoldView.unassigned}: <b>{counts.unassigned}</b></span>
        <span className="chip">სულ: <b>{cfg.loops.length}</b></span>
      </div>

      <table className="tbl" data-testid="mapping-table">
        <thead>
          <tr>
            <th>{ka.mapping.loop}</th>
            <th>{ka.mapping.room}</th>
            <th>{ka.mapping.crosses}</th>
            <th>{ka.mapping.note}</th>
          </tr>
        </thead>
        <tbody>
          {cfg.loops.map((l) => (
            <tr key={l.id}>
              <td style={{ color: l.room ? ROOM_COLOR[l.room] : '#999', fontWeight: 700 }}>{l.id}</td>
              <td>
                <select
                  value={l.room ?? ''}
                  data-testid={`room-${l.id}`}
                  onChange={(e) => setCfg({ ...cfg, loops: reassignLoop(cfg.loops, l.id, isRoom(e.target.value) ? e.target.value : null), mappingVerified: false })}
                >
                  {roomOpt(true)}
                </select>
              </td>
              <td>
                <select value={l.crossesInto ?? ''} onChange={(e) => setCfg({ ...cfg, loops: setLoopCrossing(cfg.loops, l.id, isRoom(e.target.value) ? e.target.value : null) })}>
                  <option value="">—</option>
                  {ROOMS.filter((r) => r !== l.room).map((r) => (
                    <option key={r} value={r}>
                      {cfg.roomNames[r]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input value={l.note} maxLength={80} onChange={(e) => setCfg({ ...cfg, loops: cfg.loops.map((q) => (q.id === l.id ? { ...q, note: e.target.value } : q)) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{ka.mapping.owners}</h3>
      <p className="small">{ka.mapping.ownerHint}</p>
      <div className="row wrap">
        {(['hall', 'wardrobe'] as const).map((f) => (
          <label key={f}>
            {cfg.roomNames[f]} →{' '}
            <select value={cfg.owners[f]} data-testid={`owner-${f}`} onChange={(e) => setCfg({ ...cfg, owners: { ...cfg.owners, [f]: e.target.value as ZoneId } })}>
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {cfg.roomNames[z]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <h3>{ka.mapping.rename}</h3>
      <div className="row wrap">
        {ROOMS.map((r: RoomId) => (
          <label key={r}>
            {ROOM_GEOMETRY[r].planAreaM2} მ²{' '}
            <input value={cfg.roomNames[r]} maxLength={40} onChange={(e) => e.target.value.trim() && setCfg({ ...cfg, roomNames: { ...cfg.roomNames, [r]: e.target.value } })} />
          </label>
        ))}
      </div>
      <p className="small t-dim">
        {ka.mapping.storage} ჰოლის დახატული ფართი ≈ {roomDrawnArea(ROOM_GEOMETRY.hall).toFixed(2)} მ² (გეგმაზე 7.11 მ² — კონტური მიახლოებითია).
      </p>
    </div>
  );
}

const NEED: Record<string, string> = { required: 'აუცილებელი', architecture: 'არქიტექტურაზე დამოკიდ.', optional: 'არჩევითი' };

export function EquipmentPage() {
  return (
    <div className="page">
      <h2>{ka.tabs.equipment}</h2>
      <p className="small t-dim">ფასები არ არის მოცემული. „მაგალითი“ მხოლოდ მომხმარებლის ბმული / მითითებაა — პროდუქტის გვერდები არ წამიკითხავს.</p>
      <table className="tbl">
        <thead>
          <tr>
            <th>კომპონენტი</th>
            <th>რაოდ.</th>
            <th>ჩაშენებული / გარე</th>
            <th>საჭიროება</th>
            <th>მაგალითი</th>
            <th>თავსებადობა</th>
            <th>წყარო</th>
          </tr>
        </thead>
        <tbody>
          {EQUIPMENT.map((e) => (
            <tr key={e.name}>
              <td>{e.name}</td>
              <td>{e.qty}</td>
              <td>{e.placement === 'built-in' ? 'ქვაბში ჩაშენებული' : 'გარე'}</td>
              <td>{NEED[e.need]}</td>
              <td>{e.example}</td>
              <td>{e.compat}</td>
              <td className="small">{e.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChecklistPage() {
  const [done, setDone] = useState<Record<number, boolean>>({});
  return (
    <div className="page">
      <h2>{ka.tabs.checklist}</h2>
      <ul className="checklist">
        {CHECKLIST.map((c, i) => (
          <li key={i}>
            <label className="check">
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} />
              {c}
            </label>
          </li>
        ))}
      </ul>
      <p className="small t-dim">მონიშვნები არ ინახება — ეს მხოლოდ სამუშაო სიაა.</p>
    </div>
  );
}

export function OpenItemsPage() {
  return (
    <div className="page" data-testid="open-items">
      <h2>{ka.tabs.open}</h2>
      <ol>
        {OPEN_ITEMS.map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ol>
    </div>
  );
}

export function SourcesPage() {
  return (
    <div className="page">
      <h2>{ka.tabs.sources}</h2>
      <h3>მწარმოებლის / მითითების დოკუმენტები</h3>
      {SOURCES.map((s) => (
        <div key={s.id} className="src-card">
          <b>[{s.id}] {s.title}</b>
          <div className="small">გამომცემელი: {s.publisher} · მოდელი: {s.model} · {s.doc}</div>
          <div className="small">
            URL: <code>{s.url}</code> · {s.host} · წვდომა: {s.accessed}
          </div>
          <div className="small t-dim">{s.notes}</div>
        </div>
      ))}
      <p className="small t-warn">library.ariston.co.uk იტვირთება JS-ით — ტექსტის ამოღება ვერ მოხერხდა; ამიტომ გამოყენებულია ზემოთ ჩამოთვლილი ასლები.</p>
      <h3>მწარმოებლის მიერ მხარდაჭერილი ფაქტები (წაკითხული)</h3>
      <table className="tbl">
        <tbody>
          {MANUAL_FACTS.map((f) => (
            <tr key={f.fact}>
              <td>{f.fact}</td>
              <td className="small">{f.ref}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Section title="მომხმარებლის ფაქტები" items={USER_FACTS} />
      <Section title="პროტოტიპის დაშვებები" items={PROTOTYPE_ASSUMPTIONS} />
      <Section title="დაუდასტურებელი გადაწყვეტილებები" items={UNVERIFIED_DECISIONS} />
      <Section title="სიმულაციის შეზღუდვები" items={SIM_LIMITATIONS} />
      <p className="small t-dim">ფართის შემოწმება: გეგმის ჯამი {ROOMS.reduce((s, r) => s + ROOM_GEOMETRY[r].planAreaM2, 0).toFixed(2)} მ².</p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <>
      <h3>{title}</h3>
      <ul>
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </>
  );
}
