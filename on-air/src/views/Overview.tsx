import { ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { ActivityLog } from "../components/Activity";
import { SearchDialog } from "../components/Dialogs";
import { NowPlayingCard } from "../components/NowPlaying";
import { PlanPanel } from "../components/PlanPanel";
import { RequestControl } from "../components/RequestControl";
import { RequestList } from "../components/Requests";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot } from "../lib/types";
import { ActivePaths } from "./Queue";
import { StatusNotices } from "./StatusNotices";

export function Overview({ snap, go, onConnectSpotify }: { snap: AppSnapshot; go: (r: string) => void; onConnectSpotify: () => void }) {
  const [adding, setAdding] = useState(false);
  const upcoming = snap.queue.filter((r) => r.status !== "playing");
  return (
    <div className="page">
      <StatusNotices snap={snap} onConnectSpotify={onConnectSpotify} />
      <div className="ov-layout">
        <div className="ov-main">
          <NowPlayingCard snap={snap} onConnect={onConnectSpotify} />
          <div className="ov-pair">
            <RequestControl snap={snap} onOpenSettings={(s) => go(s)} />
            <PlanPanel snap={snap} />
          </div>
        </div>
        <aside className="ov-side">
          <section className="card" aria-labelledby="next-h">
            <div className="card-head">
              <div className="row" style={{ gap: 8 }}>
                <span className="eyebrow" id="next-h">{t("q.next_up")}</span>
                {upcoming.length > 0 && <span className="badge">{upcoming.length}</span>}
              </div>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn btn-sm btn-icon" onClick={() => setAdding(true)} aria-label={t("q.add")} title={t("q.add")}><Plus size={15} /></button>
                {upcoming.length > 7 && <button className="btn btn-ghost btn-sm" onClick={() => go("queue")}>{t("q.view_all")}</button>}
              </div>
            </div>
            <div style={{ paddingTop: 6, paddingBottom: 6 }}>
              {upcoming.length === 0 ? (
                <div className="empty-inline">
                  <span className="e-icon"><ListMusic size={19} /></span>
                  <div className="col grow" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 620 }}>{t("q.empty")}</span>
                    <ActivePaths snap={snap} />
                  </div>
                </div>
              ) : (
                <RequestList items={upcoming.slice(0, 7)} compact etas={snap.plan.etas} />
              )}
            </div>
          </section>
          <section className="card" aria-labelledby="act-h">
            <div className="card-head"><span className="eyebrow" id="act-h">{t("act.title")}</span></div>
            <ActivityLog items={snap.activity} limit={5} />
          </section>
        </aside>
      </div>
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}
