import L from "leaflet";
import { MARKER_CATEGORY_COLORS, type MarkerCategory } from "@/lib/constants";

export function categoryIcon(category: MarkerCategory, highlighted = false): L.DivIcon {
  const color = MARKER_CATEGORY_COLORS[category] ?? "#9db3a5";
  const size = highlighted ? 26 : 20;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};border:2px solid rgba(10,14,12,0.9);transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

export function playerIcon(username: string, color = "#4ade80"): L.DivIcon {
  const initials = username.slice(0, 2).toUpperCase();
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:#182019;border:2px solid ${color};color:#e8f0ea;font-size:11px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.6)">${initials}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

export function textIcon(text: string, color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div style="padding:2px 7px;border-radius:6px;background:rgba(10,14,12,0.85);border:1px solid ${color};color:${color};font-size:12px;font-weight:600;white-space:nowrap;transform:translate(-50%,-100%)">${escapeHtml(
      text,
    )}</div>`,
    iconSize: [0, 0],
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
