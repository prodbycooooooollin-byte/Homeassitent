import { useState } from 'react';
import { parseItemList } from '../lib/analyze';
import { ITEMS, displayName, findItem, itemColor, stackSize } from '../lib/items';
import { formatBreakdown } from '../lib/stacks';
import { uid } from '../lib/store';
import type { ItemEntry } from '../lib/types';

interface Props {
  items: ItemEntry[];
  lang: 'de' | 'en';
  onChange: (items: ItemEntry[]) => void;
}

const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Chest({ items, lang, onChange }: Props) {
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);

  const rows = Math.max(3, Math.ceil(items.length / 9));
  const slots = Array.from({ length: rows * 9 }, (_, i) => items[i]);
  const done = items.filter((i) => i.done).length;

  const set = (id: string, p: Partial<ItemEntry>) => onChange(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const add = (n: string, c = count) => {
    const clean = n.trim();
    if (!clean) return;
    const canon = findItem(clean)?.en ?? clean;
    const existing = items.find((i) => i.name.toLowerCase() === canon.toLowerCase());
    if (existing) set(existing.id, { count: existing.count + c, done: false });
    else onChange([...items, { id: uid(), name: canon, count: c, done: false }]);
    setName('');
    setCount(1);
  };
  const importList = () => {
    const parsed = parseItemList(paste);
    let next = [...items];
    for (const p of parsed) {
      const ex = next.find((i) => i.name.toLowerCase() === p.name.toLowerCase());
      if (ex) next = next.map((i) => (i === ex ? { ...i, count: i.count + p.count } : i));
      else next.push({ id: uid(), name: p.name, count: p.count, done: false });
    }
    onChange(next);
    setPaste('');
    setShowPaste(false);
  };

  return (
    <div className="chest-wrap">
      <div className="chest-head">
        <strong>Materialliste</strong>
        <span className="muted">{done}/{items.length} abgehakt</span>
      </div>
      <div className="bar"><div style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>

      <div className="chest" role="list" aria-label="Kiste mit Items">
        {slots.map((it, i) =>
          it ? (
            <button
              key={it.id}
              role="listitem"
              className={`slot ${it.done ? 'done' : ''}`}
              style={{ background: itemColor(it.name) }}
              title={`${displayName(it.name, lang)} ×${it.count} – klicken zum Abhaken`}
              aria-pressed={it.done}
              onClick={() => set(it.id, { done: !it.done })}
            >
              <span className="ini">{initials(displayName(it.name, 'en'))}</span>
              <span className="cnt">{it.count > 1 ? it.count : ''}</span>
              {it.done && <span className="tick">✓</span>}
            </button>
          ) : (
            <div key={`e${i}`} className="slot empty" />
          ),
        )}
      </div>

      {items.length > 0 && (
        <ul className="itemlist">
          {items.map((it) => (
            <li key={it.id} className={it.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={it.done} onChange={(e) => set(it.id, { done: e.target.checked })} />
                <span className="nm">{displayName(it.name, lang)}</span>
              </label>
              <span className="muted stk">{formatBreakdown(it.count, stackSize(it.name))}</span>
              <input
                className="num"
                type="number"
                min={1}
                value={it.count}
                aria-label={`Anzahl ${it.name}`}
                onChange={(e) => set(it.id, { count: Math.max(1, +e.target.value || 1) })}
              />
              <button className="ghost" aria-label={`${it.name} entfernen`} onClick={() => onChange(items.filter((x) => x.id !== it.id))}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={(e) => { e.preventDefault(); add(name); }}>
        <input list="item-names" placeholder="Item hinzufügen (z. B. Trichter)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="num" type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, +e.target.value || 1))} aria-label="Anzahl" />
        <button className="primary" type="submit">+</button>
        <datalist id="item-names">
          {ITEMS.map((i) => <option key={i.en} value={lang === 'de' ? i.de : i.en} />)}
        </datalist>
      </form>

      <div className="chips">
        {ITEMS.filter((i) => i.common).map((i) => (
          <button key={i.en} className="chip" onClick={() => add(i.en, 1)}>+ {i[lang]}</button>
        ))}
        <button className="chip" onClick={() => setShowPaste((v) => !v)}>📋 Liste einfügen</button>
        {items.length > 0 && (
          <>
            <button className="chip" onClick={() => onChange(items.map((i) => ({ ...i, done: true })))}>Alle abhaken</button>
            <button className="chip" onClick={() => onChange(items.map((i) => ({ ...i, done: false })))}>Zurücksetzen</button>
          </>
        )}
      </div>

      {showPaste && (
        <div className="paste">
          <p className="muted">Materialliste aus Videobeschreibung oder angeheftetem Kommentar einfügen, z. B. „64x Hopper“ oder „Observer x 12“ – eine Zeile pro Item.</p>
          <textarea rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button className="primary" onClick={importList} disabled={!paste.trim()}>Importieren</button>
        </div>
      )}
    </div>
  );
}
