import { Icon } from "@/components/ui/icon";
import { Card, CardContent } from "@/components/ui/card";

export function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3 p-4 pb-2 sm:p-5 sm:pb-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
          <Icon name={icon} size={16} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="text-xs text-ink-muted">{description}</p>}
        </div>
      </div>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {description && <p className="text-xs text-ink-faint">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const settingsFieldClasses =
  "h-11 rounded-xl border border-line bg-surface-raised px-3.5 text-sm text-ink outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent";
