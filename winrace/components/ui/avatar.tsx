import { cn } from "@/lib/cn";

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  ring?: string;
}

const sizeMap = { xs: "h-6 w-6 text-[10px]", sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function Avatar({ src, name, size = "md", className, ring }: AvatarProps) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-base-card-hover font-semibold text-ink-muted",
        sizeMap[size],
        className
      )}
      style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- beliebige, nutzerdefinierte Bild-URLs
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
