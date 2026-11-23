// Animierte Stromkabel im Modell. Dicke und Fließgeschwindigkeit folgen der
// gemessenen Leistung; Kabel sind durch Wände sichtbar („Röntgenblick“).
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { clsx } from "clsx";
import { BatteryCharging, BatteryMedium, Sun, Zap, UtilityPole } from "lucide-react";
import type { Project } from "@/model/types";
import { computeFlows, type Flow, type FlowKind } from "@/energy/flows3d";
import { formatPower } from "@/energy/units";
import { useLive, isConnected } from "@/store/live";
import type { Quality } from "@/store/ui";

const COLORS: Record<FlowKind, string> = { pv: "#E3A33B", battery: "#4D9A7A", grid: "#6F7773", consumer: "#7866B2" };

let stripe: THREE.Texture | null = null;
function stripeTexture() {
  if (stripe) return stripe;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 8;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, 0, 64, 8);
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "rgba(255,255,255,0.35)");
  g.addColorStop(0.55, "rgba(255,255,255,1)");
  g.addColorStop(0.7, "rgba(255,255,255,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 8);
  stripe = new THREE.CanvasTexture(c);
  stripe.wrapS = stripe.wrapT = THREE.RepeatWrapping;
  return stripe;
}

function Cable({ flow, animate }: { flow: Flow; animate: boolean }) {
  const { geometry, material, length } = useMemo(() => {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    let len = 0;
    for (let i = 1; i < flow.path.length; i++) {
      const a = new THREE.Vector3(...flow.path[i - 1]);
      const b = new THREE.Vector3(...flow.path[i]);
      len += a.distanceTo(b);
      curve.add(new THREE.LineCurve3(a, b));
    }
    const radius = Math.min(0.08, 0.02 + Math.log10(Math.max(10, flow.watts)) * 0.014);
    const geo = new THREE.TubeGeometry(curve, Math.max(8, Math.round(len * 6)), radius, 8, false);
    const tex = stripeTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, len * 2.2), 1);
    const mat = new THREE.MeshBasicMaterial({ color: COLORS[flow.kind], map: tex, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
    return { geometry: geo, material: mat, length: len };
    // Neu aufbauen nur bei geändertem Weg oder spürbar anderer Leistung
  }, [JSON.stringify(flow.path), flow.kind, Math.round(Math.log10(Math.max(10, flow.watts)) * 6)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  // Geschwindigkeit wächst logarithmisch mit der Leistung
  const speed = 0.3 + Math.log10(Math.max(10, flow.watts)) * 0.35;
  useFrame((_, dt) => {
    if (!animate) return;
    (material.map as THREE.Texture).offset.x -= (dt * speed * 2.2) / Math.max(1, length / 4);
  });
  return <mesh geometry={geometry} material={material} renderOrder={20} />;
}

function Badge({ position, children, tone, testId, place = "center" }: { position: [number, number, number]; children: React.ReactNode; tone: FlowKind | "hub"; testId?: string; place?: "center" | "above" | "below" }) {
  // Anzeigen ober- bzw. unterhalb ihres Ankers verringern Überdeckungen
  const shift = place === "above" ? "translate(-50%, calc(-100% - 18px))" : place === "below" ? "translate(-50%, 14px)" : "translate(-50%, -50%)";
  return (
    <Html position={position} zIndexRange={[18, 0]} style={{ pointerEvents: "none", transform: shift }}>
      <div
        data-testid={testId}
        className={clsx(
          "flex items-center gap-1 whitespace-nowrap rounded-2xl border px-2 py-0.5 text-[11px] font-semibold shadow-soft tabular-nums",
          tone === "pv" && "border-[#E3A33B] bg-[#FDF2DC] text-[#7A4F00]",
          tone === "battery" && "border-sage bg-sage-soft text-sage-dark",
          tone === "grid" && "border-line-strong bg-surface text-ink",
          tone === "consumer" && "border-energy/40 bg-energy-soft text-energy-dark",
          tone === "hub" && "border-line bg-surface/95 text-ink-2",
        )}
      >
        {children}
      </div>
    </Html>
  );
}

export function EnergyFlows({ project, quality, showHub = true }: { project: Project; quality: Quality; showHub?: boolean }) {
  const states = useLive((s) => s.states);
  const connected = useLive((s) => isConnected(s.status));
  const { flows, nodes } = useMemo(() => computeFlows(project, states, connected), [project, states, connected]);
  const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = !reduced && quality !== "low" && flows.length > 0;
  const { invalidate } = useThree();
  useFrame(() => {
    if (animate) invalidate();
  });
  return (
    <group>
      {flows.map((f) => (
        <Cable key={f.key} flow={f} animate={animate} />
      ))}
      {showHub && (
        <Badge position={[nodes.hub[0], nodes.hub[1] + 0.35, nodes.hub[2]]} tone="hub">
          <Zap size={11} /> Verteiler
        </Badge>
      )}
      {nodes.pv && (
        <Badge position={[nodes.pv.point[0], nodes.pv.point[1] + 0.45, nodes.pv.point[2]]} tone="pv" testId="pv-badge">
          <Sun size={12} /> PV {nodes.pv.watts === null ? "kein Wert" : formatPower(nodes.pv.watts)}
        </Badge>
      )}
      {nodes.grid && (
        <Badge position={[nodes.grid.point[0], nodes.grid.point[1] + 0.5, nodes.grid.point[2]]} tone="grid">
          <UtilityPole size={12} />
          {nodes.grid.watts === null ? "Netz: kein Wert" : nodes.grid.watts >= 0 ? `Bezug ${formatPower(nodes.grid.watts)}` : `Einspeisung ${formatPower(-nodes.grid.watts)}`}
        </Badge>
      )}
      {nodes.batteries.length > 0 && (
        // Mehrere Akkus stehen meist beieinander – eine gemeinsame, lesbare Anzeige
        <Badge
          position={[
            nodes.batteries.reduce((s, b) => s + b.point[0], 0) / nodes.batteries.length,
            Math.max(...nodes.batteries.map((b) => b.point[1])) + 0.4,
            nodes.batteries.reduce((s, b) => s + b.point[2], 0) / nodes.batteries.length,
          ]}
          tone="battery"
          place="above"
        >
          <span className="flex flex-col gap-0.5 py-0.5" data-testid="battery-badge">
            {nodes.batteries.map((b) => (
              <span key={b.meter.id} className="flex items-center gap-1">
                {b.watts !== null && b.watts < -5 ? <BatteryCharging size={12} /> : <BatteryMedium size={12} />}
                {b.meter.label}
                {b.soc !== null ? ` · ${Math.round(b.soc)} %` : ""}
                {b.watts === null ? " · kein Wert" : Math.abs(b.watts) <= 5 ? " · Ruhe" : b.watts > 0 ? ` · gibt ${formatPower(b.watts)} ab` : ` · lädt ${formatPower(-b.watts)}`}
              </span>
            ))}
          </span>
        </Badge>
      )}
      {flows
        .filter((f) => f.kind === "consumer")
        .map((f) => {
          const end = f.path[f.path.length - 1];
          return (
            <Badge key={`b:${f.key}`} position={[end[0], end[1], end[2]]} tone="consumer" place="below">
              {f.label} {formatPower(f.watts)}
            </Badge>
          );
        })}
    </group>
  );
}
