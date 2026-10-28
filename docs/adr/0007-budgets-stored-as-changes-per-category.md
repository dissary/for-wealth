# Budgets are stored as changes per Category, not as a set per month

A Budget is stored as a list of changes, each saying "from this month, this Expense Category's limit is X" or "from this month, it has no limit". A month's limit for a Category is the latest change at or before that month; nothing is written per month. We considered copying the previous month's whole set of limits into a month the first time it is edited, and rejected it: once a later month holds its own copy, a change to an earlier month stops reaching it, for every Category in that copy, not just the one that was edited, so "carries forward until changed" would quietly stop being true. Storing changes per Category keeps each Category's limit independent and makes removing a Budget an ordinary change.

## Consequences

- There is no row per month, so a month's Budgets are always worked out when read.
- Editing a month changes it and every later month up to that Category's next change; earlier months never change.
- A new user has no changes, so no Budgets, until they set one.
