import { useState } from 'react';
import { Detail } from './components/Detail';
import { Projects, Settings, Shopping, Tools } from './components/Other';
import { Search } from './components/Search';
import { useStore } from './lib/store';
import type { Farm } from './lib/types';

type Tab = 'search' | 'projects' | 'shopping' | 'tools' | 'settings';
const TABS: [Tab, string][] = [
  ['search', '🔍 Suche'],
  ['projects', '⛏️ Projekte'],
  ['shopping', '🛒 Einkauf'],
  ['tools', '🧮 Werkzeuge'],
  ['settings', '⚙️ Einstellungen'],
];

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('search');
  const [open, setOpen] = useState<Farm | null>(null);
  const openCount = store.state.builds.filter((b) => !b.done).length;

  return (
    <div className="app">
      <header>
        <h1>⛏️ FarmFinder</h1>
        <nav className="tabs" aria-label="Hauptnavigation">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}{id === 'projects' && openCount > 0 ? ` (${openCount})` : ''}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'search' && <Search store={store} onOpen={setOpen} goSettings={() => setTab('settings')} />}
        {tab === 'projects' && <Projects store={store} onOpen={setOpen} />}
        {tab === 'shopping' && <Shopping store={store} />}
        {tab === 'tools' && <Tools lang={store.state.lang} />}
        {tab === 'settings' && <Settings store={store} />}
      </main>
      {open && <Detail farm={store.state.builds.find((b) => b.farm.id === open.id)?.farm ?? open} store={store} onClose={() => setOpen(null)} />}
    </div>
  );
}
