import { useState, type FormEvent } from "react";
import { percentOfIncome } from "../lib/budget";
import { formatMoney, parseAmount, type Currency } from "../lib/money";
import type { Expense } from "../types";
import { Card } from "./Card";
import { MoneyInput } from "./MoneyInput";

type Props = {
  expenses: Expense[];
  income: number;
  totalExpenses: number;
  currency: Currency;
  onAdd: (name: string, amount: number) => void;
  onUpdate: (id: string, patch: Partial<Omit<Expense, "id">>) => void;
  onRemove: (id: string) => void;
};

// Adding and editing share these rules: a name, and an amount above zero.
function isValidName(name: string): boolean {
  return name.trim() !== "";
}

function isValidAmount(amount: number | null): amount is number {
  return amount !== null && amount > 0;
}

export function ExpenseList({
  expenses,
  income,
  totalExpenses,
  currency,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const [name, setName] = useState("");
  const [amountInput, setAmountInput] = useState("");

  const amount = parseAmount(amountInput);
  const canAdd = isValidName(name) && isValidAmount(amount);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    onAdd(name.trim(), amount);
    setName("");
    setAmountInput("");
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium tracking-wide text-slate-300 uppercase">
          Fixed expenses
        </h2>
        <span className="text-xs text-slate-500">
          {expenses.length} {expenses.length === 1 ? "item" : "items"}
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 grid grid-cols-[1fr_8rem_auto] gap-2"
      >
        <input
          type="text"
          placeholder="e.g. Rent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Expense name"
          className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/10 focus:outline-none"
        />
        <MoneyInput
          value={amountInput}
          onChange={setAmountInput}
          aria-label="Expense amount"
          className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-right text-sm text-white tabular-nums placeholder:text-slate-600 focus:border-emerald-400/60 focus:ring-4 focus:ring-emerald-400/10 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canAdd}
          className="rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          Add
        </button>
      </form>

      {expenses.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
          <p className="text-sm text-slate-400">No expenses yet.</p>
          <p className="mt-1 text-xs text-slate-600">
            Add rent, bills, subscriptions, loans…
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-white/5">
          {expenses.map((exp) => (
            <ExpenseRow
              key={exp.id}
              expense={exp}
              income={income}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {expenses.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold text-white tabular-nums">
            {formatMoney(totalExpenses, currency)}
          </span>
        </div>
      )}
    </Card>
  );
}

type RowProps = {
  expense: Expense;
  income: number;
  onUpdate: Props["onUpdate"];
  onRemove: Props["onRemove"];
};

// The boxes hold what's being typed; the expense only changes when that's
// valid. Leaving a box while it's invalid puts the saved value back.
function ExpenseRow({ expense, income, onUpdate, onRemove }: RowProps) {
  const [nameInput, setNameInput] = useState(expense.name);
  const [amountInput, setAmountInput] = useState(expense.amount.toFixed(2));

  const share = percentOfIncome(expense.amount, income);

  function handleNameChange(value: string) {
    setNameInput(value);
    if (isValidName(value)) onUpdate(expense.id, { name: value.trim() });
  }

  function handleAmountChange(value: string) {
    setAmountInput(value);
    const amount = parseAmount(value);
    if (isValidAmount(amount)) onUpdate(expense.id, { amount });
  }

  return (
    <li className="group py-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => setNameInput(expense.name)}
          aria-label="Edit expense name"
          aria-invalid={!isValidName(nameInput)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-sm text-slate-100 hover:bg-white/5 focus:bg-white/5 focus:outline-none aria-invalid:ring-1 aria-invalid:ring-rose-400/60"
        />
        <MoneyInput
          value={amountInput}
          onChange={handleAmountChange}
          onBlur={() => setAmountInput(expense.amount.toFixed(2))}
          aria-label="Edit expense amount"
          aria-invalid={!isValidAmount(parseAmount(amountInput))}
          className="w-28 rounded-lg bg-transparent px-2 py-1 text-right text-sm font-medium text-slate-100 tabular-nums hover:bg-white/5 focus:bg-white/5 focus:outline-none aria-invalid:ring-1 aria-invalid:ring-rose-400/60"
        />
        <button
          type="button"
          onClick={() => onRemove(expense.id)}
          aria-label={`Remove ${expense.name}`}
          className="rounded-lg p-1.5 text-slate-500 opacity-60 transition group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-400"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-3 px-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-emerald-400/70 transition-all"
            style={{ width: `${Math.min(share, 100)}%` }}
          />
        </div>
        <span className="w-12 text-right text-[11px] text-slate-500 tabular-nums">
          {income > 0 ? `${share.toFixed(1)}%` : "—"}
        </span>
      </div>
    </li>
  );
}
