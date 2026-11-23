"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SkeletonCard } from "@/components/ui/skeleton";
import { AutomationCard } from "@/components/automations/automation-card";
import { AutomationEditor } from "@/components/automations/automation-editor";
import { useApp } from "@/lib/state/app-context";

export default function AutomationenPage() {
  const { snapshot, loading } = useApp();
  const [editorOpen, setEditorOpen] = useState(false);

  if (loading || !snapshot) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automationen"
        description={`${snapshot.automations.filter((a) => a.enabled).length} von ${snapshot.automations.length} aktiv`}
        action={
          <Button variant="primary" size="sm" onClick={() => setEditorOpen(true)}>
            <Icon name="plus" size={15} className="mr-1.5" />
            Neue Automation
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {snapshot.automations.map((automation) => (
          <AutomationCard key={automation.id} automation={automation} />
        ))}
      </div>

      <AutomationEditor open={editorOpen} onClose={() => setEditorOpen(false)} />
    </div>
  );
}
