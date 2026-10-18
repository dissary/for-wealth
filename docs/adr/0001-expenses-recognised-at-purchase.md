# Expenses are recognised at purchase; own-money movements are not recorded

An Expense is dated when the purchase is made, whatever it was paid with, and moving money between the user's own places (credit card bill payments, e-wallet top-ups, transfers to savings) is not recorded at all. We chose this over "spent when it leaves the bank" because that rule double-counts or delays credit card and e-wallet spending, and the only other fix, tracking each money source with balances and transfers, was deliberately left out of v1.

## Consequences

- There is no Transfer concept. Do not add "card payment" or "top-up" as a Category; these must not be entered as Expenses.
- Totals reflect what was bought, not bank balances, so they will not reconcile against a bank statement.
