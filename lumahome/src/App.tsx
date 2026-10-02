import { Suspense, lazy, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { boot, logout, startDemo, useApp } from "@/app/boot";
import { useUi } from "@/store/ui";
import { useProject } from "@/store/project";
import { TopBar } from "@/shell/TopBar";
import { BottomNav } from "@/shell/BottomNav";
import { Toasts } from "@/shell/Toasts";
import { HomeView } from "@/home/HomeView";
import { ControlCard } from "@/home/ControlCard";
import { Onboarding } from "@/shell/Onboarding";
import { SettingsSheet } from "@/shell/SettingsSheet";
import { DesignView } from "@/design/DesignView";
import { EnergyView } from "@/energyui/EnergyView";
import { DevicesView } from "@/devicesui/DevicesView";
import { useShortcuts } from "@/shell/useShortcuts";
import { Notice } from "@/ui/primitives";
import { FloorPlan } from "@/design/FloorPlan";
import { useEnvironment } from "@/environment/useEnvironment";
import { skyGradient } from "@/environment/weather";

const SceneCanvas = lazy(() => import("@/scene/SceneCanvas"));

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function App() {
  const phase = useApp((s) => s.phase);
  const error = useApp((s) => s.error);
  const notice = useApp((s) => s.notice);
  const tab = useUi((s) => s.tab);
  const designView = useUi((s) => s.designView);
  const project = useProject((s) => s.project);
  const hasGl = useMemo(webglAvailable, []);
  const env = useEnvironment();
  const weatherOn = useUi((s) => s.layers.weather);
  const [skyTop, skyBottom] = weatherOn ? skyGradient(env) : ["#F5F3EE", "#E7EAE3"];
  useShortcuts();

  useEffect(() => {
    void boot();
  }, []);

  if (phase === "loading")
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-2" role="status">
        LumaHome wird geladen …
      </div>
    );
  if (phase === "error")
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md">
          <Notice tone="error" title="Fehler beim Laden">
            {error}
          </Notice>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => location.reload()}>
              Erneut versuchen
            </button>
            <button className="btn-secondary" onClick={() => void logout()}>
              Abmelden
            </button>
            <button className="btn-ghost" onClick={() => void startDemo()}>
              Demo ansehen
            </button>
          </div>
        </div>
      </div>
    );
  if (phase === "onboarding") return <Onboarding />;

  // Die 3D-Szene bleibt dauerhaft eingebunden, damit Kamera und Auswahl beim Wechsel erhalten bleiben.
  const sceneVisible = tab === "home" || tab === "energy" || (tab === "design" && designView !== "2d");
  const split = tab === "design" && designView === "split";
  return (
    <div className="relative h-full overflow-hidden transition-[background] duration-700" style={{ background: `linear-gradient(to bottom, ${skyTop}, ${skyBottom})` }}>
      <div
        className={clsx("absolute inset-y-0 right-0 transition-[left] duration-200", split ? "left-1/2" : "left-0", !sceneVisible && "invisible")}
        aria-hidden={!sceneVisible}
      >
        {project && hasGl && (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-ink-2">3D-Ansicht wird geladen …</div>}>
            <SceneCanvas />
          </Suspense>
        )}
        {project && !hasGl && sceneVisible && (
          <div className="absolute inset-0">
            <FloorPlan readOnly />
            <div className="absolute left-1/2 top-24 z-10 w-[min(90%,28rem)] -translate-x-1/2">
              <Notice tone="warn" title="3D-Darstellung nicht verfügbar">
                Dein Browser oder Gerät unterstützt kein WebGL. LumaHome zeigt stattdessen den Grundriss – Steuerung und Energieansicht funktionieren weiterhin.
              </Notice>
            </div>
          </div>
        )}
      </div>
      {tab === "home" && <HomeView />}
      {tab === "design" && <DesignView />}
      {tab === "energy" && <EnergyView />}
      {tab === "devices" && <DevicesView />}
      <ControlCard />
      <TopBar />
      <BottomNav />
      {notice && (
        <div className="absolute inset-x-0 top-24 z-30 flex justify-center px-3">
          <div className="max-w-lg">
            <Notice tone="info">
              {notice}{" "}
              <button className="font-medium underline" onClick={() => useApp.setState({ notice: null })}>
                Ausblenden
              </button>
            </Notice>
          </div>
        </div>
      )}
      <SettingsSheet />
      <Toasts />
    </div>
  );
}
