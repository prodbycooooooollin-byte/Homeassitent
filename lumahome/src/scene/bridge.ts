// Verbindung zwischen 3D-Szene und DOM-Oberfläche (Projektion, Bodenpunkte).
import * as THREE from "three";
import type { Vec2 } from "@/model/types";

interface SceneBridge {
  camera: THREE.Camera | null;
  canvas: HTMLCanvasElement | null;
  controls: { enabled: boolean } | null;
  invalidate: () => void;
}

export const bridge: SceneBridge = { camera: null, canvas: null, controls: null, invalidate: () => undefined };

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** Schnittpunkt eines Bildschirmpunkts mit der Bodenebene (Planebene) auf Höhe y. */
export function pickPlan(clientX: number, clientY: number, y: number): Vec2 | null {
  const { camera, canvas } = bridge;
  if (!camera || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null;
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  plane.constant = -y;
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x, y: hit.z };
}

const v = new THREE.Vector3();

/** Projiziert einen Weltpunkt in Bildschirmkoordinaten (relativ zum Canvas). */
export function projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } | null {
  const { camera, canvas } = bridge;
  if (!camera || !canvas) return null;
  v.set(x, y, z).project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 && v.z > -1 };
}

export function isOverCanvas(clientX: number, clientY: number): boolean {
  const c = bridge.canvas;
  if (!c || c.offsetParent === null) return false;
  const r = c.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return false;
  const el = document.elementFromPoint(clientX, clientY);
  return el === c;
}
