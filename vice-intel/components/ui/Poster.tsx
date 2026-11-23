import type { ArtScene } from "@/lib/content/schema";
import { cn } from "@/lib/cn";

/**
 * Typographic poster used wherever no real image exists yet.
 * Deliberately not an illustration: a tinted gradient, film grain and an
 * oversized outlined word. Looks intentional instead of "fake artwork".
 */
const TINTS: Record<string, [string, string]> = {
  sunset: ["#ff7a59", "#a855f7"],
  lagoon: ["#14b8a6", "#6d28d9"],
  violet: ["#a855f7", "#ec4899"],
  amber: ["#f59e0b", "#7c3aed"],
};

const SCENE_TINT: Record<ArtScene, keyof typeof TINTS> = {
  skyline: "sunset",
  beach: "sunset",
  keys: "sunset",
  highway: "violet",
  swamp: "lagoon",
  mountain: "lagoon",
  harbor: "amber",
  industrial: "amber",
  garage: "amber",
  vault: "amber",
  "night-sky": "violet",
  club: "violet",
  interior: "violet",
  suburb: "sunset",
};

export function Poster({ scene, seed, text, className }: { scene: ArtScene; seed: number; text?: string; className?: string }) {
  const [a, b] = TINTS[SCENE_TINT[scene]];
  const x = 20 + ((seed * 37) % 60);
  const y = 15 + ((seed * 53) % 40);
  return (
    <div aria-hidden className={cn("grain absolute inset-0 overflow-hidden bg-ink-900", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 55% at ${x}% ${y}%, ${a}55 0%, transparent 70%), radial-gradient(70% 60% at ${100 - x}% ${100 - y / 2}%, ${b}66 0%, transparent 70%), linear-gradient(160deg, #15111f 0%, #07060b 100%)`,
        }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px)] bg-[size:100%_6px]" />
      {text ? (
        <span
          className="absolute -bottom-[0.18em] -left-[0.04em] select-none whitespace-nowrap font-display font-extrabold uppercase italic leading-none tracking-tight text-transparent"
          style={{ fontSize: "clamp(56px, 22cqw, 220px)", WebkitTextStroke: "1.5px rgba(255,255,255,0.16)" }}
        >
          {text}
        </span>
      ) : null}
    </div>
  );
}
