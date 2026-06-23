import { AlertTriangle, TriangleAlert, CheckCircle2 } from "lucide-react";

export function BudgetBadge({
  status,
  showOk = false,
}: {
  status: string;
  showOk?: boolean;
}) {
  if (status === "over") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-destructive/15 text-destructive whitespace-nowrap">
        <AlertTriangle className="size-3" /> Over budget
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 whitespace-nowrap">
        <TriangleAlert className="size-3" /> Near budget
      </span>
    );
  }
  if (!showOk) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
      <CheckCircle2 className="size-3" /> On track
    </span>
  );
}
