"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useSocketEvent } from "@/lib/hooks/use-room-realtime";
import { useRoomState } from "@/lib/client/room-state-context";
import { playPing } from "@/lib/client/sound";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/cn";

interface NotificationRow {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export function NotificationBell() {
  const { code } = useRoomState();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/notifications?code=${code}`)
      .then((r) => r.json())
      .then((d) => setItems(d.notifications ?? []))
      .catch(() => {});
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setSoundEnabled(Boolean(d.soundEnabled)))
      .catch(() => {});
  }, [code]);

  useSocketEvent<NotificationRow>("notification:new", (n) => {
    setItems((prev) => [n, ...prev].slice(0, 20));
    setUnread((u) => u + 1);
    if (soundEnabled) playPing();
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          setUnread(0);
        }}
        className="relative rounded-full p-2 text-ink-faint hover:bg-base-card-hover hover:text-ink"
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-base-border-strong bg-base-card shadow-glow">
          <div className="border-b border-base-border p-3 text-sm font-medium text-ink">Benachrichtigungen</div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-center text-sm text-ink-faint">Keine Benachrichtigungen.</p>
            ) : (
              items.map((n, i) => (
                <div key={n.id} className={cn("p-3 text-sm", i > 0 && "border-t border-base-border")}>
                  <p className="text-ink-muted">{n.message}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{formatRelativeTime(new Date(n.createdAt))}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
