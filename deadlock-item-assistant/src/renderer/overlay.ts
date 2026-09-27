import type { OverlayVM } from '../present/viewModel';
import { bridge } from './bridge';
import { type Layout, renderOverlay } from './overlayView';

const root = document.getElementById('root')!;
let layout: Layout | null = null;
let lastHtml = '';

bridge.onVM((m) => {
  const { vm, layout: l } = m as { vm: OverlayVM; layout: Layout };
  layout = l;
  document.body.classList.toggle('reduced', l.reducedMotion === 'on');
  document.body.classList.toggle('motion', l.reducedMotion === 'off');
  (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(l.scale);
  const html = renderOverlay(vm, l);
  if (html !== lastHtml) { root.innerHTML = html; lastHtml = html; }
});

// Inhaltshöhe melden → Fenster passt sich an (keine unsichtbaren Klickflächen über dem Spiel)
new ResizeObserver(() => bridge.send({ type: 'overlay-height', height: Math.ceil(root.getBoundingClientRect().height / (layout?.scale ?? 1)) })).observe(root);

root.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('[data-a]')?.getAttribute('data-a');
  if (!a || !layout) return;
  if (a === 'done') bridge.send({ type: 'toggle-edit' });
  if (a === 'reset') bridge.send({ type: 'reset-position' });
  if (a === 'scale+' || a === 'scale-') bridge.send({ type: 'settings', patch: { overlay: { scale: Math.max(0.75, Math.min(1.6, layout.scale + (a === 'scale+' ? 0.05 : -0.05))) } } });
});
root.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.a === 'opacity') bridge.send({ type: 'settings', patch: { overlay: { opacity: Number(el.value) } } });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layout?.edit) bridge.send({ type: 'toggle-edit' }); });
