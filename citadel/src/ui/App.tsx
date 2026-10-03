import { useApp, type Route } from './state.tsx';
import { BrandMark, Icons } from './components.tsx';
import { isDesktop } from '../platform/index.ts';
import { Overview } from './pages/Overview.tsx';
import { ConfigStudio } from './pages/ConfigStudio.tsx';
import { Optimize } from './pages/Optimize.tsx';
import { Crosshairs } from './pages/Crosshairs.tsx';
import { Players } from './pages/Players.tsx';
import { Benchmarks } from './pages/Benchmarks.tsx';
import { Backups } from './pages/Backups.tsx';
import { AppSettings } from './pages/AppSettings.tsx';

const NAV: { id: Route; label: string; icon: JSX.Element }[] = [
  { id: 'overview', label: 'Übersicht', icon: Icons.overview },
  { id: 'studio', label: 'Config Studio', icon: Icons.studio },
  { id: 'optimize', label: 'Optimieren', icon: Icons.optimize },
  { id: 'crosshairs', label: 'Crosshairs', icon: Icons.crosshair },
  { id: 'players', label: 'Spieler', icon: Icons.players },
  { id: 'benchmarks', label: 'Benchmarks', icon: Icons.bench },
  { id: 'backups', label: 'Profile & Backups', icon: Icons.backups },
];

export function App() {
  const app = useApp();
  const Page = { overview: Overview, studio: ConfigStudio, optimize: Optimize, crosshairs: Crosshairs, players: Players, benchmarks: Benchmarks, backups: Backups, settings: AppSettings }[app.route];
  return (
    <div className="app">
      <nav className="nav" aria-label="Hauptnavigation">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-name">CITADEL</div>
            <div className="brand-sub">Deadlock Settings &amp; Performance</div>
          </div>
        </div>
        <div className="nav-list">
          {NAV.map((n) => (
            <button key={n.id} className={`nav-item ${app.route === n.id ? 'active' : ''}`} onClick={() => app.go(n.id)} aria-current={app.route === n.id ? 'page' : undefined}>
              {n.icon}
              <span>{n.label}</span>
              {n.id === 'studio' && app.pendingCount > 0 && <span className="pending-count" style={{ marginLeft: 'auto' }}>{app.pendingCount}</span>}
            </button>
          ))}
        </div>
        <div className="nav-spacer" />
        <button className={`nav-item ${app.route === 'settings' ? 'active' : ''}`} onClick={() => app.go('settings')}>
          {Icons.settings}
          <span>Einstellungen</span>
        </button>
        <div className="nav-foot">
          {isDesktop ? 'Desktop-App' : 'Browser-Version – Import/Export'}
          {app.gameRunning && (
            <div style={{ color: 'var(--warn)', marginTop: 4 }}>● Deadlock läuft – Schreiben pausiert</div>
          )}
        </div>
      </nav>
      <main className="main" id="main">
        <Page />
        {app.busy && (
          <div className="toasts" style={{ left: 252, right: 'auto' }}>
            <div className="toast" role="status">
              {app.busy}
            </div>
          </div>
        )}
      </main>
      <div className="toasts" aria-live="polite">
        {app.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
