import { useState } from "react";
import "./App.css";
import { ExpenseList } from "./components/ExpenseList";
import { IncomeCard } from "./components/IncomeCard";
import { SummaryCard } from "./components/SummaryCard";
import { sumAmounts } from "./lib/budget";
import { parseAmount, type Currency } from "./lib/money";
import type { Expense } from "./types";

// Everything lives in memory only — a refresh starts fresh.
function App() {
  const [currency, setCurrency] = useState<Currency>("MYR");
  const [incomeInput, setIncomeInput] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const income = parseAmount(incomeInput) ?? 0;
  const totalExpenses = sumAmounts(expenses);

  function addExpense(name: string, amount: number) {
    setExpenses((prev) => [...prev, { id: crypto.randomUUID(), name, amount }]);
  }

  function updateExpense(id: string, patch: Partial<Omit<Expense, "id">>) {
    setExpenses((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  function reset() {
    setIncomeInput("");
    setExpenses([]);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.15),transparent_60%)]" />

      <main className="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              For Wealth
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Budget Tracker
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Your monthly income minus your fixed expenses.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-white/20 hover:bg-white/5"
          >
            Reset
          </button>
        </header>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-6">
            <IncomeCard
              incomeInput={incomeInput}
              currency={currency}
              onIncomeChange={setIncomeInput}
              onCurrencyChange={setCurrency}
            />
            <SummaryCard
              income={income}
              totalExpenses={totalExpenses}
              currency={currency}
            />
          </div>
          <ExpenseList
            expenses={expenses}
            income={income}
            totalExpenses={totalExpenses}
            currency={currency}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onRemove={removeExpense}
          />
        </div>

        <p className="mt-10 text-center text-xs text-slate-600">
          Nothing is saved. Refreshing the page clears everything.
        </p>
      </main>
    </div>
  );
}

export default App;
