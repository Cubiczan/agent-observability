import { useState } from "react";
import {
  useListBudgets,
  useListDepartments,
  useListModels,
  useSetBudget,
  useDeleteBudget,
  getListBudgetsQueryKey,
  getListDepartmentsQueryKey,
  type Budget,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUSD, formatPercent } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BudgetBadge } from "@/components/budget-badge";
import { Trash2 } from "lucide-react";

const DEPT_WIDE = "__all__";

function UtilizationBar({ utilization, status }: { utilization: number; status: string }) {
  const pct = Math.min(utilization * 100, 100);
  const color =
    status === "over"
      ? "bg-destructive"
      : status === "warning"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
        {formatPercent(utilization)}
      </span>
      <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Budgets() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: budgets, isLoading } = useListBudgets();
  const { data: departments } = useListDepartments();
  const { data: models } = useListModels();

  const [departmentId, setDepartmentId] = useState<string>("");
  const [modelId, setModelId] = useState<string>(DEPT_WIDE);
  const [amount, setAmount] = useState<string>("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListDepartmentsQueryKey() });
  };

  const setBudget = useSetBudget({
    mutation: {
      onSuccess: () => {
        invalidate();
        setAmount("");
        toast({ title: "Budget saved" });
      },
      onError: (err) => {
        toast({ title: "Could not save budget", description: String(err), variant: "destructive" });
      },
    },
  });

  const deleteBudget = useDeleteBudget({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Budget removed" });
      },
      onError: (err) => {
        toast({ title: "Could not remove budget", description: String(err), variant: "destructive" });
      },
    },
  });

  const handleSave = () => {
    const numericAmount = Number(amount);
    if (!departmentId) {
      toast({ title: "Pick a department", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast({ title: "Enter a budget greater than 0", variant: "destructive" });
      return;
    }
    setBudget.mutate({
      data: {
        departmentId,
        modelId: modelId === DEPT_WIDE ? null : modelId,
        amount: numericAmount,
      },
    });
  };

  const period = budgets?.[0]?.period;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
        <p className="text-muted-foreground">
          Set monthly spend caps per department (optionally per model) and track them against
          actual spend{period ? ` for ${period}` : ""}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Set a budget</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4 space-y-2">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments?.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4 space-y-2">
              <Label>Model (optional)</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger data-testid="select-model">
                  <SelectValue placeholder="Whole department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEPT_WIDE}>Whole department</SelectItem>
                  {models?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Monthly cap (USD)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="input-amount"
              />
            </div>
            <div className="md:col-span-2">
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={setBudget.isPending}
                data-testid="button-save-budget"
              >
                {setBudget.isPending ? "Saving..." : "Save budget"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configured budgets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !budgets || budgets.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No budgets configured yet. Set one above to start tracking spend.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Utilization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {budgets.map((b: Budget) => (
                  <TableRow key={b.id} data-testid={`row-budget-${b.id}`}>
                    <TableCell className="font-medium">{b.departmentName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.modelName ?? "Whole department"}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(b.amount)}</TableCell>
                    <TableCell className="text-right font-mono">{formatUSD(b.spend)}</TableCell>
                    <TableCell className="text-right">
                      <UtilizationBar utilization={b.utilization} status={b.status} />
                    </TableCell>
                    <TableCell>
                      <BudgetBadge status={b.status} showOk />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBudget.mutate({ budgetId: b.id })}
                        disabled={deleteBudget.isPending}
                        data-testid={`button-delete-budget-${b.id}`}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
