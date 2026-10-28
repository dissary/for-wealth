# Recurring Transactions are stopped, never deleted

A Recurring Transaction that is no longer wanted is stopped: it is kept, creates nothing more, and the Transactions it created still point at it. We considered deleting it outright and keeping a "created by a Recurring Transaction" flag on each Transaction instead. We rejected that because Commitments and Remaining for a past month depend on which of its Expenses came from Recurring Transactions, and one link is a single source for that, where a flag plus an optional link would be two that can disagree. Stopping also matches how Categories are archived.

## Consequences

- The Transactions a Recurring Transaction created stay ordinary Transactions: they can be edited or deleted, and they keep counting as Commitments (or towards Expected Income) in whichever month they are dated.
- Deleting an account still removes everything, as every table cascades from the user.
