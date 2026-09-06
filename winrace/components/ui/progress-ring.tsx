interface ProgressRingProps {
  percent: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
}

export function ProgressRing({ percent, size = 96, strokeWidth = 8, color, trackColor = "rgba(255,255,255,0.08)", label, sublabel }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold tabular-nums text-ink">{label ?? `${Math.round(clamped)}%`}</span>
        {sublabel && <span className="text-[10px] text-ink-faint">{sublabel}</span>}
      </div>
    </div>
  );
}
