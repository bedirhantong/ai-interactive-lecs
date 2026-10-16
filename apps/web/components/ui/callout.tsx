import { AlertTriangle, CheckCircle2, Database, Info, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const styles = {
  info: { box: "bg-info-soft border-info/25", icon: Info, color: "text-info" },
  tip: { box: "bg-brand-soft border-brand/25", icon: Lightbulb, color: "text-brand-strong" },
  warning: { box: "bg-warning-soft border-warning/30", icon: AlertTriangle, color: "text-warning" },
  success: { box: "bg-success-soft border-success/30", icon: CheckCircle2, color: "text-success" },
  data: { box: "bg-accent-soft border-accent/25", icon: Database, color: "text-accent" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof styles;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const s = styles[tone];
  const Icon = s.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", s.box, className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.color)} />
      <div className="min-w-0 flex-1">
        {title && <div className={cn("font-semibold", s.color)}>{title}</div>}
        <div className="text-text">{children}</div>
      </div>
    </div>
  );
}
