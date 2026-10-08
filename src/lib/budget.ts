// Budget maths, kept free of React so it can be tested on its own.

export function sumAmounts(items: { amount: number }[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

// What percentage of income `part` takes up; 0 when there's no income yet.
export function percentOfIncome(part: number, income: number): number {
  return income > 0 ? (part / income) * 100 : 0;
}
