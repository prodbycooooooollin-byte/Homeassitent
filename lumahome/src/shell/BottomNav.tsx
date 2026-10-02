import { clsx } from "clsx";
import { Home, PencilRuler, Zap, Cable } from "lucide-react";
import { useUi, type Tab } from "@/store/ui";

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Zuhause", icon: Home },
  { id: "design", label: "Gestalten", icon: PencilRuler },
  { id: "energy", label: "Energie", icon: Zap },
  { id: "devices", label: "Geräte", icon: Cable },
];

export function BottomNav() {
  const tab = useUi((s) => s.tab);
  const patch = useUi((s) => s.patch);
  return (
    <nav aria-label="Hauptbereiche" className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex gap-1 rounded-2xl border border-line/70 bg-surface/95 p-1 shadow-float backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => patch({ tab: t.id, card: null })}
            aria-current={tab === t.id ? "page" : undefined}
            className={clsx(
              "flex min-h-[52px] min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-[11px] font-medium transition-colors sm:min-w-[88px] sm:text-xs",
              tab === t.id ? (t.id === "energy" ? "bg-energy-soft text-energy-dark" : "bg-sage-soft text-sage-dark") : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <t.icon size={20} strokeWidth={tab === t.id ? 2.2 : 1.8} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
