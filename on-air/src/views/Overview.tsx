import { ListMusic, Plus } from "lucide-react";
import { useState } from "react";
import { ActivityLog } from "../components/Activity";
import { SearchDialog } from "../components/Dialogs";
import { NowPlayingCard } from "../components/NowPlaying";
import { RequestList } from "../components/Requests";
import { EmptyState } from "../components/ui";
import { t } from "../lib/i18n";
import { isSpotifyUsable } from "../lib/status";
import type { AppSnapshot } from "../lib/types";
import { StatusNotices } from "./StatusNotices";

export function Overview({ snap, go, onConnectSpotify }: { snap: AppSnapshot; go: (r: string) => void; onConnectSpotify: () => void }) {
  const [adding, setAdding] = useState(false);
  const upcoming = snap.queue.filter((r) => r.status !== "playing");
  const cmd = `${snap.settings.commands.prefix}${snap.settings.commands.sr.name}`;
  return (
    <div className="page">
      <StatusNotices snap={snap} onConnectSpotify={onConnectSpotify} />
      <div className="grid-2">
        <div className="col" style={{ gap: 20 }}>
          <NowPlayingCard snap={snap} onConnect={onConnectSpotify} />
          <section className="card" aria-labelledby="act-h">
            <div className="card-head">
              <h2 id="act-h">{t("act.title")}</h2>
            </div>
            <ActivityLog items={snap.activity} limit={10} />
          </section>
        </div>
        <section className="card" aria-labelledby="next-h" style={{ alignSelf: "start" }}>
          <div className="card-head">
            <h2 id="next-h">{t("q.next_up")}</h2>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setAdding(true)}>
                <Plus size={14} /> {t("q.add")}
              </button>
              {upcoming.length > 6 && (
                <button className="btn btn-ghost btn-sm" onClick={() => go("queue")}>
                  {t("q.view_all")}
                </button>
              )}
            </div>
          </div>
          <div style={{ paddingTop: 8, paddingBottom: 6 }}>
            {upcoming.length === 0 ? (
              <EmptyState icon={<ListMusic size={20} />} title={t("q.empty")}>
                {snap.settings.requests.open ? t("q.empty_hint_open", { cmd }) : t("q.empty_hint_closed")}
              </EmptyState>
            ) : (
              <RequestList items={upcoming.slice(0, 6)} compact />
            )}
          </div>
        </section>
      </div>
      {adding && <SearchDialog onClose={() => setAdding(false)} disabledReason={isSpotifyUsable(snap) ? null : snap.spotify.auth.state === "signed_in" ? "network" : "not_signed_in"} />}
    </div>
  );
}
