# A Transaction's Category decides whether it is Income or an Expense

A Transaction has no type of its own and no sign on its amount: the amount is always positive, and the Transaction is Income or an Expense because its Category is an Income or an Expense Category. A Category's kind is fixed when it is created. We considered a type column on each Transaction and signed amounts (negative for Expenses), and rejected both because they store the same fact twice, so the two can disagree: an "Income" Transaction filed under Food, or a negative amount under Salary. With the Category as the only source, that state can't exist.

## Consequences

- Moving a Transaction to a Category of the other kind turns it from an Expense into Income, or back.
- Every total joins Transactions to Categories to know which side an amount falls on.
- A refund is not a negative Expense: the original Expense is edited down, or deleted when the refund is in full.
