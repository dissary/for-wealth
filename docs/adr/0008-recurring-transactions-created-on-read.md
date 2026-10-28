# Recurring Transactions create their Transactions when the user's data is read, not on a schedule

A Recurring Transaction's Transactions are not created by a job running at midnight. Each time the user's Transactions, Dashboard or Recurring Transactions are loaded, every Due Date on or before today, in the user's time zone, that hasn't been created yet is created first. We considered a scheduler in the API process and rejected it: the app runs on the author's laptop until launch, which is often asleep on the 1st, and a scheduler would still need catching up after any downtime. Catching up on read is needed either way, and on its own it is enough, because a missing Transaction can't be seen until the user looks.

## Consequences

- Each Recurring Transaction keeps its next Due Date, which moves forward as Transactions are created. Whether a Transaction exists for a Due Date is never checked, so deleting one skips that Due Date for good instead of having it recreated on the next load.
- Nothing is created for a user who never opens the app, and after a long absence every missed Due Date is created at once, each dated on its Due Date.
- Two requests catching up at the same moment must not both create a Due Date's Transaction, so catching up locks the Recurring Transactions it moves forward.
