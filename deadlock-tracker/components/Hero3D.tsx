"use client";
import { useEffect, useRef } from "react";
import type * as T from "three";

/* 3D-Held: Ein gemeinsamer Renderer (und damit alle hochgeladenen Texturen) bleibt über alle Debriefs hinweg bestehen; Modelle werden vorab geladen und
 * „aufgewärmt“. So gibt es beim Öffnen des Debriefs kein Ruckeln mehr. Der Held folgt dem Mauszeiger. */

type Three = typeof import("three");
interface Entry { scene: T.Scene; camera: T.PerspectiveCamera; group: T.Group }
let three: Three | null = null;
let renderer: T.WebGLRenderer | null = null;
const entries = new Map<string, Promise<Entry>>();
export const hero3dDiag: { lastMaterials?: { name: string; map: boolean; keys: string[] }[] } = {};

async function lib() {
  if (!three) three = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  return { THREE: three, GLTFLoader };
}

function getRenderer(THREE: Three) {
  if (renderer) return renderer;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  r.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  renderer = r;
  return r;
}

const COLOR_KEY = (k: string) => /^g_tcolor$/i.test(k) ? 0 : /^g_tcolor\d?$/i.test(k) ? 1 : /(color|albedo|diffuse|basecolor)/i.test(k) && !/(normal|rough|metal|mask|tint|ao|occl|emis|self|spec|gloss|height|blend|detail|reveal|trans)/i.test(k) ? 2 : -1;
const stem = (n: string) => n.toLowerCase().replace(/\.(png|jpg|jpeg|webp|vtex_c|vtex)$/i, "").replace(/_c$/, "");

async function load(url: string, color: string): Promise<Entry> {
  const { THREE, GLTFLoader } = await lib();
  const r = getRenderer(THREE);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1208, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(-2.5, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(color), 2.4); rim.position.set(3, 2, -3); scene.add(rim);

  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;

  // Farb-/Normaltexturen aus den Material-Angaben des Exports zuordnen, wo der Export sie nicht selbst verbunden hat
  const parser = gltf.parser;
  const json = parser.json as { textures?: { source?: number; name?: string }[]; images?: { name?: string; uri?: string }[] };
  const byStem = new Map<string, number>();
  (json.textures ?? []).forEach((t, i) => { const img = t.source !== undefined ? json.images?.[t.source] : undefined; const n = img?.name ?? img?.uri ?? t.name; if (n) byStem.set(stem(n), i); });
  const done = new Map<number, Promise<T.Texture>>();
  const tex = (i: number) => { if (!done.has(i)) done.set(i, parser.getDependency("texture", i) as Promise<T.Texture>); return done.get(i)!; };
  const mats = new Set<T.MeshStandardMaterial>();
  model.traverse((o) => { const m = (o as T.Mesh).material; (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { if ((x as T.MeshStandardMaterial).isMeshStandardMaterial) mats.add(x as T.MeshStandardMaterial); }); });
  const diag: { name: string; map: boolean; keys: string[] }[] = [];
  await Promise.all([...mats].map(async (m) => {
    const tp = (m.userData?.vmat?.TextureParams ?? {}) as Record<string, string>;
    const keys = Object.keys(tp);
    if (!m.map) {
      const ck = keys.filter((k) => COLOR_KEY(k) >= 0).sort((a, b) => COLOR_KEY(a) - COLOR_KEY(b))[0];
      const idx = ck ? byStem.get(stem(tp[ck])) : undefined;
      if (idx !== undefined) { const t = await tex(idx); t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.color.set(0xffffff); }
    }
    if (!m.normalMap) {
      const nk = keys.find((k) => /normal/i.test(k));
      const idx = nk ? byStem.get(stem(tp[nk])) : undefined;
      if (idx !== undefined) { m.normalMap = await tex(idx); }
    }
    m.metalness = Math.min(m.metalness, 0.7);
    m.needsUpdate = true;
    diag.push({ name: m.name, map: !!m.map, keys });
  }));
  hero3dDiag.lastMaterials = diag;

  const group = new THREE.Group(); group.add(model); scene.add(group);
  const bb = new THREE.Box3().setFromObject(model); const size = bb.getSize(new THREE.Vector3()); const ctr = bb.getCenter(new THREE.Vector3());
  const sc = 1 / Math.max(0.001, size.y); model.scale.setScalar(sc); model.position.set(-ctr.x * sc, -bb.min.y * sc - 0.5, -ctr.z * sc);
  camera.position.set(0, 0.02, 2.45); camera.lookAt(0, 0.02, 0);
  // Aufwärmen: Texturen jetzt hochladen (unsichtbar), nicht erst beim Öffnen des Debriefs
  r.setSize(256, 256, false); camera.aspect = 1; camera.updateProjectionMatrix();
  r.compile(scene, camera); r.render(scene, camera);
  return { scene, camera, group };
}

const entryFor = (url: string, color: string) => { let p = entries.get(url); if (!p) { p = load(url, color); entries.set(url, p); p.catch(() => entries.delete(url)); } return p; };

/** Lädt ein Modell vorab (z. B. beim Start), damit der Debrief es sofort anzeigen kann. */
export function preloadHero3D(url: string, color = "#f0b44c") { return entryFor(url, color).then(() => true).catch(() => false); }

/** Zeigt ein Heldenmodell in 3D; bei Problemen ruft `onFail` auf (dann springt das 2D-Bild ein). */
export function Hero3D({ url, color = "#f0b44c", onFail, onReady }: { url: string; color?: string; onFail?: () => void; onReady?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let stop = () => {};
    entryFor(url, color).then((entry) => {
      const el = box.current; const r = renderer;
      if (disposed || !el || !r || !three) return;
      el.appendChild(r.domElement);
      const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
      const onMove = (e: MouseEvent) => { tgt.x = (e.clientX / window.innerWidth - 0.5) * 2; tgt.y = (e.clientY / window.innerHeight - 0.5) * 2; };
      window.addEventListener("mousemove", onMove);
      const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; r.setSize(w, h, false); entry.camera.aspect = w / h; entry.camera.updateProjectionMatrix(); };
      const ro = new ResizeObserver(resize); ro.observe(el); resize();
      const t0 = performance.now(); let raf = 0;
      const tick = () => {
        const t = (performance.now() - t0) / 1000;
        cur.x += (tgt.x - cur.x) * 0.06; cur.y += (tgt.y - cur.y) * 0.06;
        entry.group.rotation.y = -0.35 + cur.x * 0.55;
        entry.group.rotation.x = cur.y * 0.08;
        entry.group.position.y = Math.sin(t * 1.6) * 0.006;
        r.render(entry.scene, entry.camera);
        raf = requestAnimationFrame(tick);
      };
      tick();
      requestAnimationFrame(() => onReady?.());
      stop = () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove); if (r.domElement.parentElement === el) el.removeChild(r.domElement); };
      if (disposed) stop();
    }).catch(() => { if (!disposed) onFail?.(); });
    return () => { disposed = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, color]);
  return <div ref={box} className="absolute inset-0" />;
}
