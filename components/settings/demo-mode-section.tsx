"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { setDemoModeAction } from "@/lib/actions/server-setup";

export function DemoModeSection({
  enabled,
  forcedByMissingSetup,
}: {
  enabled: boolean;
  forcedByMissingSetup: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await setDemoModeAction(!enabled);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo-Modus</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-sm text-ink-muted">
          Zeigt überall deutlich gekennzeichnete Beispieldaten statt echter Serverdaten -
          nützlich, um die Oberfläche vorzuführen.
        </p>
        {forcedByMissingSetup ? (
          <p className="flex items-center gap-2 text-xs text-gold">
            <FlaskConical size={14} />
            Aktuell erzwungen, da die Serververbindung noch nicht abgeschlossen ist.
          </p>
        ) : (
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              enabled ? "bg-accent-strong" : "bg-surface-raised"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        )}
      </CardBody>
    </Card>
  );
}
