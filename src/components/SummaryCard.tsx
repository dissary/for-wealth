import { percentOfIncome } from "../lib/budget";
import { formatMoney, type Currency } from "../lib/money";

type Props = {
  income: number;
  totalExpenses: number;
  currency: Currency;
};

export function SummaryCard({ income, totalExpenses, currency }: Props) {
  const remaining = income - totalExpenses;
  const spentPct = percentOfIncome(totalExpenses, income);
  const isOver = remaining < 0;

  const tone = isOver
    ? { bar: "bg-rose-500", text: "text-rose-400", label: "Over budget" }
    : spentPct >= 80
      ? { bar: "bg-amber-400", text: "text-amber-300", label: "Tight" }
      : { bar: "bg-emerald-400", text: "text-emerald-300", label: "Healthy" };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/15 via-slate-900/40 to-cyan-500/10 p-6 shadow-xl shadow-black/20">
      <h2 className="text-sm font-medium tracking-wide text-slate-300 uppercase">
        Left after fixed expenses
      </h2>

      <p
        className={`mt-3 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl ${
          isOver ? "text-rose-400" : "text-white"
        }`}
      >
        {formatMoney(remaining, currency)}
      </p>

      {income > 0 ? (
        <>
          <div className="mt-6 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {spentPct.toFixed(1)}% of income committed
            </span>
            <span
              className={`rounded-full bg-white/5 px-2 py-0.5 font-medium ${tone.text}`}
            >
              {tone.label}
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
              style={{ width: `${Math.min(spentPct, 100)}%` }}
            />
          </div>
        </>
      ) : (
        <p className="mt-6 text-xs text-slate-500">
          Enter your income to see how much of it is committed.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <dt className="text-xs text-slate-400">Income</dt>
          <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
            {formatMoney(income, currency)}
          </dd>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <dt className="text-xs text-slate-400">Expenses</dt>
          <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
            {formatMoney(totalExpenses, currency)}
          </dd>
        </div>
      </dl>
    </section>
  );
}
