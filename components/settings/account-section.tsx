import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { formatDate } from "@/lib/format";

export function AccountSection({
  user,
}: {
  user: { displayName: string; email: string; role: Role; createdAt: Date };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Konto</CardTitle>
        <Badge tone="accent">{ROLE_LABELS[user.role]}</Badge>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-ink-muted">Anzeigename</p>
          <p className="text-sm text-ink">{user.displayName}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">E-Mail-Adresse</p>
          <p className="text-sm text-ink">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Mitglied seit</p>
          <p className="text-sm text-ink">{formatDate(user.createdAt)}</p>
        </div>
      </CardBody>
    </Card>
  );
}
