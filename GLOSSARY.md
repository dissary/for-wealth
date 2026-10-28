# For Wealth

A personal money app for recording income and spending, seeing totals over time, and planning spending against limits.

## Language

### Money movement

**Transaction**:
A single dated record of money coming in or going out, with an amount and a Category. Its Category alone decides whether it is Income or an Expense; the amount is always positive.
_Avoid_: Entry, record, item

**Income**:
A Transaction where money comes in to the user.
_Avoid_: Earning, credit

**Expense**:
A Transaction where money goes out from the user, dated when the purchase is made, whatever it was paid with. Moving money between the user's own places (card bill payments, e-wallet top-ups, transfers to savings) is never an Expense.
_Avoid_: Spending (as a noun for one record), debit, cost

**Recurring Transaction**:
A template that creates a Transaction on each Due Date of a repeating schedule, such as rent on the 1st of every month or a monthly salary. Editing it affects only Transactions not yet created. One that is no longer wanted is stopped, never deleted, so the Transactions it created still know where they came from.
_Avoid_: Fixed commitment, subscription, repeat, schedule

**Due Date**:
A day on which a Recurring Transaction's schedule says a Transaction is created.
_Avoid_: Occurrence, run date, instance

**Estimate**:
A Transaction created by a Recurring Transaction whose amount may vary, holding a guessed amount until the user confirms the real one. Saving its real amount confirms it, and it becomes an ordinary Transaction.
_Avoid_: Draft, pending, placeholder

**Category**:
A label that groups Transactions by purpose, such as Food, Transport, or Rent. A Category that is no longer wanted is archived, never deleted, so past Transactions keep it. Every Category is either an Income Category or an Expense Category.
_Avoid_: Tag, type, bucket

### Planning

**Budget**:
A spending limit for one Expense Category for one month. Each Category's limit carries forward to later months until it is changed or removed for that Category; unspent or overspent money does not.
_Avoid_: Plan, envelope, cap

**Overspent**:
A Budget whose month's Expenses in its Category have gone past its limit.
_Avoid_: Over the limit, blown, in the red

**Commitment**:
The total of a month's Expenses that are already scheduled by Recurring Transactions.
_Avoid_: Fixed costs, obligations, bills

**Expected Income**:
A month's Income already recorded plus Income that Recurring Transactions will still create later that month.
_Avoid_: Projected income, forecast

**Upcoming**:
A month's Due Dates whose Transactions have not been created yet.
_Avoid_: Scheduled, pending, future Transactions

**Free to Spend**:
A month's Expected Income minus its Commitments.
_Avoid_: Disposable income, leftover, balance

**Remaining**:
Free to Spend minus the month's Expenses that were not created by Recurring Transactions.
_Avoid_: Left over, balance, available

### Time

**Period**:
A window of time (a day, a week, or a month) over which Transactions are grouped and totalled.
_Avoid_: Range, timeframe, interval
