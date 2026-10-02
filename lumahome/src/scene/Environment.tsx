// Licht, Himmel und Wetter der Szene: Sonnenstand bestimmt Richtung und Farbe
// des Tageslichts; Wolken, Regen und Schnee erscheinen nur außerhalb des Hauses.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Project } from "@/model/types";
import type { EnvState } from "@/environment/weather";
import { sunStrength } from "@/environment/weather";
import { bounds, pointInPolygon } from "@/geometry/polygon";
import type { Quality } from "@/store/ui";

const prefersReducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useBounds(project: Project | null) {
  return useMemo(() => {
    const pts = project?.rooms.flatMap((r) => r.vertices) ?? [];
    if (!pts.length) return { cx: 0, cz: 0, size: 10, minX: -5, maxX: 5, minY: -5, maxY: 5 };
    const b = bounds(pts);
    return { cx: (b.minX + b.maxX) / 2, cz: (b.minY + b.maxY) / 2, size: Math.max(b.width, b.height, 4), minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY };
  }, [project?.rooms]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Richtung zur Sonne in Weltkoordinaten (Plan-Norden = −y, gedreht um northAngle). */
export function sunDirection(azimuthDeg: number, elevationDeg: number, northAngleDeg: number): THREE.Vector3 {
  const a = ((azimuthDeg + northAngleDeg) * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  // Norden zeigt im Plan nach −y; im Uhrzeigersinn drehen (y nach unten)
  const dx = Math.sin(a);
  const dz = -Math.cos(a);
  return new THREE.Vector3(dx * Math.cos(e), Math.sin(e), dz * Math.cos(e)).normalize();
}

function glowTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let cloudTex: THREE.Texture | null = null;
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 18 + Math.sin(i * 2.1) * 12;
    const y = 70 + Math.cos(i * 1.7) * 14;
    const r = 30 + (i % 3) * 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

export function SceneLights({ project, env, shadows, quality, enabled }: { project: Project | null; env: EnvState; shadows: boolean; quality: Quality; enabled: boolean }) {
  const hb = useBounds(project);
  const ref = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const north = project?.settings.northAngle ?? 0;
  // Ohne Wetteranzeige: neutrales Tageslicht wie bisher
  const elev = enabled ? env.elevation : 45;
  const az = enabled ? env.azimuth : 200;
  const strength = enabled ? sunStrength(env) : 1;
  const dir = sunDirection(az, Math.max(elev, 8), north);
  const night = enabled && env.isNight;
  const dusk = enabled && !night && elev < 10;
  const d = hb.size * 1.2 + 14;
  useEffect(() => {
    target.position.set(hb.cx, 0, hb.cz);
    target.updateMatrixWorld();
    if (ref.current) {
      ref.current.target = target;
      const cam = ref.current.shadow.camera;
      const s = hb.size * 0.9 + 4;
      cam.left = -s;
      cam.right = s;
      cam.top = s;
      cam.bottom = -s;
      cam.near = 1;
      cam.far = d * 3;
      cam.updateProjectionMatrix();
    }
  }, [hb, target, d]);
  const mapSize = quality === "high" ? 2048 : 1024;
  return (
    <>
      <hemisphereLight args={[night ? "#7F92B8" : dusk ? "#FFE2C2" : "#FFFFFF", night ? "#2E3442" : "#D8D2C4", night ? 0.6 : 0.75 + 0.4 * Math.min(1, strength + 0.3)]} />
      <ambientLight intensity={night ? 0.28 : 0.22} color={night ? "#B8C4E0" : "#FFFFFF"} />
      <directionalLight
        ref={ref}
        position={[hb.cx + dir.x * d, Math.max(4, dir.y * d), hb.cz + dir.z * d]}
        intensity={night ? 0.25 : 0.35 + 1.75 * strength}
        color={night ? "#9DB2E0" : dusk ? "#FFC58F" : "#FFF6E8"}
        castShadow={shadows && !night && strength > 0.2}
        shadow-mapSize-width={mapSize}
        shadow-mapSize-height={mapSize}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
    </>
  );
}

function SkyBodies({ project, env }: { project: Project | null; env: EnvState }) {
  const hb = useBounds(project);
  const north = project?.settings.northAngle ?? 0;
  const sunTex = useMemo(() => glowTexture("rgba(255,244,214,1)", "rgba(255,214,150,0)"), []);
  const moonTex = useMemo(() => glowTexture("rgba(235,240,255,1)", "rgba(200,210,240,0)"), []);
  const R = hb.size * 2.4 + 30;
  const overcast = ["cloudy", "rain", "pouring", "storm", "fog", "snow"].includes(env.sky);
  if (env.elevation > -2 && !overcast) {
    const d = sunDirection(env.azimuth, Math.max(env.elevation, 2), north);
    const s = env.elevation < 8 ? 10 : 7;
    return (
      <sprite position={[hb.cx + d.x * R, d.y * R, hb.cz + d.z * R]} scale={[s, s, 1]} renderOrder={-1}>
        <spriteMaterial map={sunTex} transparent depthWrite={false} toneMapped={false} fog={false} />
      </sprite>
    );
  }
  if (env.isNight && env.sky !== "pouring" && env.sky !== "storm") {
    // Mond grob gegenüber der Sonne
    const d = sunDirection(env.azimuth + 180, 35, north);
    return (
      <sprite position={[hb.cx + d.x * R, d.y * R, hb.cz + d.z * R]} scale={[4, 4, 1]}>
        <spriteMaterial map={moonTex} transparent depthWrite={false} toneMapped={false} fog={false} opacity={overcast ? 0.3 : 0.9} />
      </sprite>
    );
  }
  return null;
}

function Clouds({ project, env, animate }: { project: Project | null; env: EnvState; animate: boolean }) {
  const hb = useBounds(project);
  const group = useRef<THREE.Group>(null);
  const count = { clear: 0, partly: 5, cloudy: 10, rain: 12, pouring: 14, snow: 10, fog: 6, storm: 14, unknown: 0 }[env.sky];
  const dark = env.sky === "rain" || env.sky === "pouring" || env.sky === "storm";
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / Math.max(1, count)) * Math.PI * 2 + i * 0.7;
        const r = hb.size * (1.4 + ((i * 37) % 10) / 10) + 14;
        return { x: hb.cx + Math.cos(a) * r, z: hb.cz + Math.sin(a) * r, y: 7 + ((i * 13) % 5), s: 8 + ((i * 7) % 5) };
      }),
    [count, hb],
  );
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    if (!animate || !group.current || !count) return;
    group.current.position.x = (group.current.position.x + dt * 0.25) % 12;
    invalidate();
  });
  if (!count) return null;
  return (
    <group ref={group}>
      {items.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s * 2, c.s, 1]}>
          <spriteMaterial map={cloudTexture()} transparent depthWrite={false} opacity={env.isNight ? 0.25 : dark ? 0.85 : 0.75} color={dark ? "#9AA1A4" : env.isNight ? "#7A8496" : "#FFFFFF"} />
        </sprite>
      ))}
    </group>
  );
}

/** Regen- bzw. Schneepartikel um das Haus herum – nie innerhalb geschlossener Räume. */
function Precipitation({ project, env, quality, animate }: { project: Project | null; env: EnvState; quality: Quality; animate: boolean }) {
  const hb = useBounds(project);
  const snow = env.sky === "snow";
  const rainy = env.sky === "rain" || env.sky === "pouring" || env.sky === "storm";
  const base = quality === "high" ? 2400 : 1200;
  const n = snow ? Math.round(base * 0.5) : rainy ? (env.sky === "rain" ? base : Math.round(base * 1.5)) : 0;
  const indoor = useMemo(() => (project?.rooms ?? []).filter((r) => !r.outdoor).map((r) => r.vertices), [project?.rooms]);
  const area = { minX: hb.minX - 10, maxX: hb.maxX + 10, minZ: hb.minY - 10, maxZ: hb.maxY + 10, top: 14 };
  const spawn = (arr: Float32Array, i: number, y?: number) => {
    let x = 0;
    let z = 0;
    for (let k = 0; k < 6; k++) {
      x = area.minX + Math.random() * (area.maxX - area.minX);
      z = area.minZ + Math.random() * (area.maxZ - area.minZ);
      if (!indoor.some((poly) => pointInPolygon({ x, y: z }, poly))) break;
      x = NaN;
    }
    if (Number.isNaN(x)) x = area.minX - 1;
    const yy = y ?? Math.random() * area.top;
    if (snow) {
      arr[i * 3] = x;
      arr[i * 3 + 1] = yy;
      arr[i * 3 + 2] = z;
    } else {
      arr[i * 6] = x;
      arr[i * 6 + 1] = yy;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + 0.02;
      arr[i * 6 + 4] = yy - 0.35;
      arr[i * 6 + 5] = z + 0.02;
    }
  };
  const geo = useMemo(() => {
    if (!n) return null;
    const arr = new Float32Array(n * (snow ? 3 : 6));
    for (let i = 0; i < n; i++) spawn(arr, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [n, snow, indoor, hb]); // eslint-disable-line react-hooks/exhaustive-deps
  const { invalidate } = useThree();
  useFrame((_, dtRaw) => {
    if (!geo || !animate) return;
    const dt = Math.min(dtRaw, 0.05);
    const arr = geo.getAttribute("position").array as Float32Array;
    const speed = snow ? 1.2 : env.sky === "rain" ? 11 : 15;
    for (let i = 0; i < n; i++) {
      if (snow) {
        arr[i * 3 + 1] -= speed * dt;
        arr[i * 3] += Math.sin((arr[i * 3 + 1] + i) * 0.8) * dt * 0.4;
        if (arr[i * 3 + 1] < -0.2) spawn(arr, i, area.top);
      } else {
        arr[i * 6 + 1] -= speed * dt;
        arr[i * 6 + 4] -= speed * dt;
        if (arr[i * 6 + 4] < -0.2) spawn(arr, i, area.top);
      }
    }
    geo.getAttribute("position").needsUpdate = true;
    invalidate();
  });
  if (!geo) return null;
  return snow ? (
    <points geometry={geo}>
      <pointsMaterial color="#FFFFFF" size={0.09} transparent opacity={0.9} depthWrite={false} />
    </points>
  ) : (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={env.isNight ? "#8C9BB0" : "#7F98AE"} transparent opacity={0.55} depthWrite={false} />
    </lineSegments>
  );
}

function Lightning({ active }: { active: boolean }) {
  const ref = useRef<THREE.AmbientLight>(null);
  const next = useRef(performance.now() + 4000);
  useFrame(() => {
    if (!ref.current) return;
    const now = performance.now();
    if (active && now > next.current) {
      ref.current.intensity = 2.2;
      next.current = now + 3000 + Math.random() * 7000;
    } else ref.current.intensity = Math.max(0, ref.current.intensity - 0.15);
  });
  return <ambientLight ref={ref} intensity={0} color="#E8EEFF" />;
}

export function WeatherEffects({ project, env, quality }: { project: Project | null; env: EnvState; quality: Quality }) {
  const animate = !prefersReducedMotion() && quality !== "low";
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = env.sky === "fog" ? new THREE.Fog(env.isNight ? "#2A3138" : "#D9DCD8", 12, 70) : null;
  }, [env.sky, env.isNight, scene]);
  return (
    <>
      <SkyBodies project={project} env={env} />
      {quality !== "low" && <Clouds project={project} env={env} animate={animate} />}
      {quality !== "low" && <Precipitation project={project} env={env} quality={quality} animate={animate} />}
      {env.sky === "storm" && animate && <Lightning active />}
    </>
  );
}
