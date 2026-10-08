"use client";
import { Fragment } from "react";
import { Icon, type IconName } from "./Icon";
import { useData, useTracker, type ProfileData } from "./Providers";
import { Onboarding } from "./Onboarding";
import type { TrackedPlayerDto } from "./useTracker";

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-3xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <>
      <div className="skeleton h-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="skeleton h-96" />
    </>
  );
}

export function Empty({ icon = "layers", title, text }: { icon?: IconName; title: string; text?: string }) {
  return (
    <div className="surface flex flex-col items-center justify-center gap-2 p-12 text-center">
      <Icon name={icon} size={44} className="text-white/20" />
      <div className="font-semibold">{title}</div>
      {text && <div className="max-w-sm text-sm text-muted">{text}</div>}
    </div>
  );
}

/** Stellt sicher, dass ein Account gewählt und Daten geladen sind – sonst Onboarding bzw. Skeleton. */
export function Gate({ children }: { children: (ctx: { me: TrackedPlayerDto; data: ProfileData }) => React.ReactNode }) {
  const { status, account } = useTracker();
  const { data } = useData();
  const adding = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("add");
  if (!status) return <PageSkeleton />;
  if (!status.players.filter((p) => !p.guest).length || adding) return <Onboarding first={!status.players.filter((p) => !p.guest).length} />;
  const me = status.players.find((p) => p.accountId === account);
  if (!me || !data) return <PageSkeleton />;
  return <Fragment>{children({ me, data })}</Fragment>;
}
