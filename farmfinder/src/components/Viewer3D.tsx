import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SchematicModel } from '../lib/litematic';

const MAX_INSTANCES = 250_000;

const KNOWN: [RegExp, number][] = [
  [/observer|dispenser|dropper|furnace|stone|cobble|smooth|andesite|diorite|granite|tuff|deepslate/, 0x8a8a8a],
  [/hopper|iron|anvil|cauldron|chain/, 0x55555c],
  [/redstone_block|redstone_lamp|redstone/, 0xd02b2b],
  [/slime/, 0x7ed957],
  [/honey/, 0xe8a31b],
  [/glass|ice/, 0xaee3ea],
  [/water/, 0x3f76e4],
  [/lava|magma|fire/, 0xe86a13],
  [/piston/, 0xa98c5b],
  [/oak|spruce|birch|jungle|acacia|dark_oak|cherry|mangrove|planks|log|wood|barrel|chest|slab|stairs|fence|trapdoor|door|sign|ladder/, 0xb8945a],
  [/grass|leaves|moss|vine|kelp|cactus|bamboo|sugar_cane/, 0x4f8f3a],
  [/dirt|farmland|path|mud/, 0x79553a],
  [/sand|sandstone/, 0xe0d6a0],
  [/obsidian|netherite|blackstone|basalt/, 0x2a1a44],
  [/netherrack|nether|crimson|warped|soul/, 0x7a3a3a],
  [/rail/, 0x9b8b6a],
  [/torch|lantern|glowstone|sea_lantern/, 0xf1c93b],
  [/wool|carpet|concrete|terracotta|banner|bed/, 0xc8c8d0],
];

export function blockColor(name: string): THREE.Color {
  const n = name.replace('minecraft:', '');
  for (const [re, c] of KNOWN) if (re.test(n)) return new THREE.Color(c);
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.35, 0.5);
}

/** Nur Blöcke mit mindestens einer freien Seite rendern (Innenleben spart Speicher, bleibt per Schicht-Regler sichtbar). */
function visibleBlocks(model: SchematicModel): number[] {
  const [sx, sy, sz] = model.size;
  const solid = new Uint8Array(sx * sy * sz);
  const idx = (x: number, y: number, z: number) => (y * sz + z) * sx + x;
  const b = model.blocks;
  for (let i = 0; i < b.length; i += 4) solid[idx(b[i], b[i + 1], b[i + 2])] = 1;
  const out: number[] = [];
  for (let i = 0; i < b.length; i += 4) {
    const [x, y, z] = [b[i], b[i + 1], b[i + 2]];
    const open =
      x === 0 || y === 0 || z === 0 || x === sx - 1 || y === sy - 1 || z === sz - 1 ||
      !solid[idx(x - 1, y, z)] || !solid[idx(x + 1, y, z)] || !solid[idx(x, y - 1, z)] ||
      !solid[idx(x, y + 1, z)] || !solid[idx(x, y, z - 1)] || !solid[idx(x, y, z + 1)];
    if (open) out.push(i);
  }
  return out;
}

export default function Viewer3D({ model }: { model: SchematicModel }) {
  const mount = useRef<HTMLDivElement>(null);
  const [maxY, setMaxY] = useState(model.size[1] - 1);
  const setLayer = useRef<(y: number) => void>(() => {});

  useEffect(() => {
    const el = mount.current!;
    const [sx, sy, sz] = model.size;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1d1a);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.1, 2000);
    const dist = Math.max(sx, sy, sz) * 1.8 + 4;
    camera.position.set(sx / 2 + dist * 0.8, sy / 2 + dist * 0.7, sz / 2 + dist);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(sx / 2, sy / 2, sz / 2);
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);

    const visible = visibleBlocks(model).slice(0, MAX_INSTANCES);
    const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const mat = new THREE.MeshLambertMaterial();
    const mesh = new THREE.InstancedMesh(geo, mat, visible.length);
    const colors = model.palette.map(blockColor);
    const m4 = new THREE.Matrix4();
    const ys: number[] = [];
    visible.forEach((bi, n) => {
      const b = model.blocks;
      m4.setPosition(b[bi] + 0.5, b[bi + 1] + 0.5, b[bi + 2] + 0.5);
      mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, colors[b[bi + 3]]);
      ys.push(b[bi + 1]);
    });
    scene.add(mesh);

    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    setLayer.current = (limit: number) => {
      const b = model.blocks;
      visible.forEach((bi, n) => {
        if (ys[n] <= limit) { m4.setPosition(b[bi] + 0.5, b[bi + 1] + 0.5, b[bi + 2] + 0.5); mesh.setMatrixAt(n, m4); }
        else mesh.setMatrixAt(n, zero);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };

    let raf = 0;
    const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geo.dispose(); mat.dispose(); mesh.dispose(); renderer.dispose();
      renderer.domElement.remove();
    };
  }, [model]);

  const truncated = model.totalBlocks > MAX_INSTANCES;
  return (
    <div className="viewer">
      <div ref={mount} className="canvas" aria-label="3D-Ansicht der Farm" />
      <label className="field layer">
        Schicht bis Höhe {maxY + 1} / {model.size[1]} (nach unten ziehen, um das Innere zu sehen)
        <input type="range" min={0} max={model.size[1] - 1} value={maxY}
          onChange={(e) => { const y = +e.target.value; setMaxY(y); setLayer.current(y); }} />
      </label>
      <p className="muted small">
        {model.size.join(' × ')} Blöcke · {model.totalBlocks.toLocaleString('de')} Blöcke gesamt · Maus: drehen/zoomen · Farben sind Näherungen (keine Texturen).
        {truncated && ' Sehr große Datei – nur ein Teil wird dargestellt.'}
      </p>
    </div>
  );
}
