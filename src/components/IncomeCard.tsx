import { CURRENCIES, type Currency } from "../lib/money";
import { Card } from "./Card";
import { MoneyInput } from "./MoneyInput";

type Props = {
  incomeInput: string;
  currency: Currency;
  onIncomeChange: (value: string) => void;
  onCurrencyChange: (value: Currency) => void;
};

export function IncomeCard({
  incomeInput,
  currency,
  onIncomeChange,
  onCurrencyChange,
}: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-wide text-slate-300 uppercase">
          Monthly income (nett)
        </h2>
        <select
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value as Currency)}
          aria-label="Currency"
          className="rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs font-medium text-slate-200 focus:ring-2 focus:ring-emerald-400/60 focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <label className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 transition focus-within:border-emerald-400/60 focus-within:ring-4 focus-within:ring-emerald-400/10">
        <span className="text-lg font-semibold text-slate-500">{currency}</span>
        <MoneyInput
          value={incomeInput}
          onChange={onIncomeChange}
          className="w-full bg-transparent text-3xl font-semibold text-white tabular-nums placeholder:text-slate-600 focus:outline-none"
        />
      </label>
      <p className="mt-3 text-xs text-slate-500">
        Your take-home pay after tax and deductions.
      </p>
    </Card>
  );
}
