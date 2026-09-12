import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeGameKey, formatNumber } from "@/lib/format";

export function StatBreakdownList({
  title,
  items,
  emptyHint,
  limit = 8,
}: {
  title: string;
  items: { key: string; value: number }[];
  emptyHint: string;
  limit?: number;
}) {
  const top = items.slice(0, limit);
  const max = top[0]?.value ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        {top.length === 0 ? (
          <p className="text-sm text-ink-muted">{emptyHint}</p>
        ) : (
          <div className="space-y-2">
            {top.map((item) => (
              <div key={item.key} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-ink-muted sm:w-40">
                  {humanizeGameKey(item.key)}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-ink">{formatNumber(item.value)}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
