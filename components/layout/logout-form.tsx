import { logoutAction } from "@/lib/actions/auth";
import { LogOut } from "lucide-react";

export function LogoutForm({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-raised hover:text-danger"
      >
        <LogOut size={16} />
        {!compact && "Abmelden"}
      </button>
    </form>
  );
}
