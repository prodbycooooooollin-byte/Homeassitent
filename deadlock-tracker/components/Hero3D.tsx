"use client";
import { useEffect, useRef } from "react";

/** Zeigt ein exportiertes Heldenmodell (GLB) in 3D: sanftes Atmen, Kopf/Oberkörper folgen dem Mauszeiger. Bei Problemen ruft `onFail` auf, damit das 2D-Bild einspringt. */
export function Hero3D({ url, color = "#f0b44c", onFail }: { url: string; color?: string; onFail?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const el = box.current; if (!el || disposed) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
        el.appendChild(renderer.domElement);
        renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
        scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x1a1208, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-2.5, 3, 4); scene.add(key);
        const rim = new THREE.DirectionalLight(new THREE.Color(color), 3.2); rim.position.set(3, 2, -3); scene.add(rim);
        const fill = new THREE.PointLight(new THREE.Color(color), 18, 12); fill.position.set(2, 0.5, 2.5); scene.add(fill);

        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) { renderer.dispose(); return; }
        const model = gltf.scene;
        const group = new THREE.Group(); group.add(model); scene.add(group);
        // Modell auf Höhe 1 normieren und mittig auf den Boden stellen
        const bb = new THREE.Box3().setFromObject(model); const size = bb.getSize(new THREE.Vector3()); const ctr = bb.getCenter(new THREE.Vector3());
        const sc = 1 / Math.max(0.001, size.y); model.scale.setScalar(sc); model.position.set(-ctr.x * sc, -bb.min.y * sc - 0.5, -ctr.z * sc);
        camera.position.set(0, 0.05, 3.1); camera.lookAt(0, 0.05, 0);
        let mixer: InstanceType<typeof THREE.AnimationMixer> | null = null;
        if (gltf.animations.length) {
          const idle = gltf.animations.find((a) => /idle|stand|loadout|select|breath/i.test(a.name)) ?? gltf.animations[0];
          mixer = new THREE.AnimationMixer(model); mixer.clipAction(idle).play();
        }
        const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
        const onMove = (e: MouseEvent) => { tgt.x = (e.clientX / window.innerWidth - 0.5) * 2; tgt.y = (e.clientY / window.innerHeight - 0.5) * 2; };
        window.addEventListener("mousemove", onMove);
        const resize = () => { const w = el.clientWidth || 1, h = el.clientHeight || 1; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
        const ro = new ResizeObserver(resize); ro.observe(el); resize();
        const clock = new THREE.Clock(); let raf = 0;
        const tick = () => {
          const dt = clock.getDelta(); const t = clock.elapsedTime;
          mixer?.update(dt);
          cur.x += (tgt.x - cur.x) * 0.06; cur.y += (tgt.y - cur.y) * 0.06;
          group.rotation.y = -0.35 + cur.x * 0.55;       // folgt der Maus nach links/rechts
          group.rotation.x = cur.y * 0.08;                // leichtes Neigen
          group.position.y = Math.sin(t * 1.6) * 0.006;   // Atmen
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();
        cleanup = () => {
          cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("mousemove", onMove);
          scene.traverse((o) => { const m = o as import("three").Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as import("three").Material | import("three").Material[] | undefined; (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose()); });
          renderer.dispose(); renderer.domElement.remove();
        };
        if (disposed) cleanup();
      } catch { if (!disposed) onFail?.(); }
    })();
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, color]);
  return <div ref={box} className="absolute inset-0" />;
}
