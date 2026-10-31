# For Wealth: v1 spec

Decisions from the design session on 2026-10-18. Terms in **bold** are defined in [GLOSSARY.md](../GLOSSARY.md). Decisions that are hard to reverse have their reasons recorded in [docs/adr/](adr/).

## Who it's for

The author is the first user. Once the foundation works, it goes to friends and family, so v1 is built for multiple users with login from day one.

## Scope

### In v1

- Record **Income** and **Expense** **Transactions** by hand: amount, date, **Category**, optional note.
- Browse Transactions by **Period**: Day, Week, Month, with ‹ › to step back and forward (this is how "yesterday" works). Filter by Category.
- Monthly **Budgets** per Expense Category, with progress bars.
- **Recurring Transactions** (monthly, weekly, yearly) that create real Transactions on their due dates. Variable bills create an **Estimate** to confirm later.
- Dashboard: this month's **Expected Income**, Expenses, **Commitments**, **Free to Spend**, **Remaining** (and per-day for the rest of the month), Budget progress, upcoming recurring items, Estimates to confirm.
- Settings: Categories, name, password, currency (chosen at signup, shown read-only), time zone.
- Delete your account and all its data (slice 7, before inviting friends).
- Desktop-first layout that also works in a phone browser.

### Deliberately not in v1

| Feature | When |
|---|---|
| CSV import from bank statements | v2 |
| Spending trend charts, Category pie charts | v1.1 |
| CSV export of your data | v1.1 |
| Savings goals | later |
| Pay-cycle months (e.g. the 25th to the 24th) | later setting |
| Money sources (cash, card, e-wallet) with balances and transfers | later, if ever (see ADR 0001) |
| Multiple currencies | later |
| Week start setting (weeks start on Monday in v1) | later setting |
| Two-factor sign-in | later |
| Google sign-in (dropped from slice 6 on 2026-10-31) | later |
| Changing your email | later |
| Bank syncing (Plaid and similar) | not planned |
| Envelope / zero-based budgeting | not planned |
| Subcategories, tags, merchant field, attachments | add only if needed |
| "Every 2 weeks" and other custom schedules | add when asked |
| Native mobile app | after web v1 |

## Rules

### Money

- Amounts are stored as **integers in the currency's minor units** (RM12.50 is stored as `1250`; ¥1500 is stored as `1500`). Never use floats for money. Convert only for display.
- Each user has one currency, picked at signup (default MYR) and fixed afterwards.
- Currencies don't all have 2 decimal places (JPY has 0, KWD has 3). The money helpers in `packages/shared` convert using the currency's own number of decimal places, never a hard-coded 100.
- Signup offers a fixed list of currencies kept in `packages/shared`, each stored with its ISO code and its number of decimal places: MYR, SGD, USD, EUR, GBP, AUD, JPY. JPY is on the list so the 0-decimal path is always tested. Adding a currency is a one-line change plus tests.

### Dates and time

- A Transaction has a **calendar date only** (`2026-10-18`), plus a separate created-at timestamp used for sorting.
- Each user has a time zone (detected from the browser). "Today", "this week" and "this month" are always calculated in the user's time zone, never the server's.
- Weeks start on Monday. Months follow the calendar. Neither is a setting in v1.

### When an Expense counts

An Expense is dated when the purchase is made, whatever it was paid with. Credit card bill payments, e-wallet top-ups and transfers to savings are **not recorded at all**. See [ADR 0001](adr/0001-expenses-recognised-at-purchase.md).

### Transactions

Decided on 2026-10-22, for slice 2.

- A Transaction is Income or an Expense because of its Category; it has no type of its own ([ADR 0005](adr/0005-category-decides-income-or-expense.md)). Moving it to a Category of the other kind changes which it is.
- **Amount**: always positive, from 1 minor unit up to 100,000,000,000 minor units (RM1,000,000,000.00), stored as a Postgres `bigint`. Zero is not allowed.
- **Typing an amount**: "12.50" and "1,234.50" both work; commas are only thousands separators, so they must fall every three digits ("12,50" is refused rather than read as 12.50). More decimal places than the currency has ("12.505" in MYR, "1500.5" in JPY) is refused with a message, never rounded.
- **Date**: from 2000-01-01 up to one year after today, with today taken in the user's time zone. The field starts on today, or on the day being viewed when the Transactions page shows a single past or future Day.
- **Note**: optional, at most 200 characters, trimmed; a blank note is stored as no note.
- **Refunds**: edit the original Expense down, or delete it when the refund is in full. Past months' totals change accordingly, because that is what was really spent.
- **Deleting**: after a confirmation step, the Transaction is gone for good. No soft delete and no undo.
- **Editing**: whichever save comes last wins. No conflict warning.
- **Shown as**: Income amounts carry a "+" ("+RM3,000.00"); Expense amounts carry no sign ("RM12.50"). Every row shows its Category's name, and its note when it has one. A Period's Income and Expense totals carry no sign, as their labels say which is which. Red and green stay reserved for Budgets.
- Dates and money are formatted one way for everyone in v1, English (Malaysia): "Thu, 22 Oct 2026", "RM1,234.50". A setting can come later. Intl's en-MY writes "RM 1,234.50"; the space after a symbol is dropped, but kept (non-breaking) after a three-letter code: "SGD 1,234.50".
- **Category**: a new Transaction can't be filed under an archived Category. The API answers 404, the same as for another user's Category or one that doesn't exist.
- As built in slice 2: `GET /api/transactions/:id` reads one Transaction, `PATCH` edits it and `DELETE` removes it (204). `PATCH` takes any of amount, date, `categoryId` and note, under the rules for adding; a field left out stays as it was, and a blank or `null` note removes the note. Moving a Transaction to an archived Category is refused with 404, but keeping the archived Category it already has is allowed, so old Transactions can still be edited. A Transaction that isn't the user's, doesn't exist, or whose ID isn't an ID gets 404 `TRANSACTION_NOT_FOUND`; a Category that can't be used gets 404 `CATEGORY_NOT_FOUND`. The dialog sends every field on save, and lists an archived Category as "Food (archived)" when editing a Transaction under it.

### The Transactions page

- Lives at `/transactions`, and opens on today as a Day. (In slice 2, `/` sent signed-in users here; from slice 3, `/` is the Dashboard.)
- At the top: the Period's label ("Thu, 22 Oct 2026", "19–25 Oct 2026", "26 Oct – 1 Nov 2026", "October 2026"), ‹ › to step back and forward, and a Today button. Below it, the Period's Income total and Expense total. No net figure, so nothing competes with **Remaining**.
- Then the Transactions, newest date first, grouped under date headings; within a day, the most recently added first.
- A Category filter. With a filter on, the totals cover only that Category.
- The Period, its date and the filter live in the address bar (`/transactions?period=week&date=2026-10-22&category=<id>`), so back, refresh and bookmarks return to the same view. Switching between Day, Week and Month keeps the date. ‹ › stop at the same bounds as a Transaction's date.
- The API accepts only a Day, a Week or a Month, never an arbitrary range, and returns every Transaction in it without paging.
- As built in slice 2: `GET /api/transactions` takes `period`, `date` and an optional `category`, and any other parameter gives 400. A `date` outside a Transaction's bounds gives 400. The filter accepts an archived Category, because old Transactions keep it; one that isn't the user's gives 404, the same answer as for adding. The answer names the filtered Category, so the page can show an archived one in the picker. Period boundaries, ‹ › and the labels live in `packages/shared/src/periods.ts`.
- In the address bar, each invalid value is dropped on its own: an unknown `period` becomes a Day, a bad or out-of-bounds `date` becomes today, and a malformed `category` becomes no filter. With no `date`, the page shows today and moves on at midnight; the Today button removes `date` and keeps the Period and the filter.
- ‹ › move a Day by a day, a Week by seven days and a Month by a calendar month, keeping the day of the month (31 Jan goes to 28 Feb). A step that would pass a bound lands on the bound, so the Period holding 2000-01-01 or one year after today is shown, and the button stops there.
- Adding and editing happen in a dialog over the page (a sheet on a phone). An Expense / Income switch, starting on Expense, chooses which Categories the picker shows. Saving closes the dialog and refreshes the list.
- Every signed-in page has a header: the app name, links to the Dashboard and Transactions (from slice 3), and a menu with the user's name holding their email, Settings and Sign out. (Until slice 6 the menu also showed currency and time zone; they move to Settings.)

### The Dashboard

Decided on 2026-10-24, for slice 3. Slices 4 and 5 add Budgets, Free to Spend, Remaining, Upcoming and Estimates to this page.

- Lives at `/`, so signing in without a `redirect` lands here. The header's links read Dashboard, then Transactions.
- Shows one month: its Income total, its Expense total, and **Expenses by Category**. Income isn't broken down by Category.
- No net figure, Free to Spend, Remaining or per-day figure until slice 5 (see "The Dashboard in slice 5"). Before Recurring Transactions exist, Remaining would be Income recorded minus Expenses, which is negative every month until the salary is recorded; in slice 5, Expected Income counts recurring Income still due, so the figures arrive together then.
- **Expenses by Category**: one row per Expense Category with Expenses that month, showing its name, its total and its share of the month's Expenses ("Food RM820.00 · 34%"). Largest total first; equal totals fall back to the Category's position. Categories with no Expenses that month are left out (from slice 4, unless they have a Budget that month). An archived Category with Expenses that month is listed as "Food (archived)".
- Shares are whole percentages. A share under 1% shows "<1%", never "0%". Rounded shares may not add up to 100%, and nothing adjusts them.
- No bars in slice 3. In slice 4, each row gains its Budget limit and a progress bar, so a bar always means Budget progress.
- From slice 4: a Category with a Budget that month has a row even with no Expenses, showing RM0.00 spent and no share. Budgeted rows show their Budget as set out under Budgets. Each entry in `expenseCategories` gains `budget` (the month's limit, or `null`), and a Category with a Budget but no Expenses comes back with `total: 0`. There is still no total of all Budgets beside the Income and Expense totals; that comes with Free to Spend in slice 5.
- A row opens the Transactions page on that Month, filtered to that Category (`/transactions?period=month&date=2026-10-01&category=<id>`). The Income and Expense totals open that Month with no filter.
- The month lives in the address bar (`/?month=2026-10`). ‹ › step one calendar month, and a "This month" button removes `month`. The bounds are the months holding 2000-01-01 and one year after today. An invalid or out-of-bounds `month` is dropped and the page shows this month. With no `month`, the page shows this month in the user's time zone and moves on at midnight on the 1st.
- A month's totals count every Transaction dated in it, including ones dated later than today.
- With no Expenses in the month, the list is replaced by "No Expenses in October 2026." and an Add Transaction button. The totals still show, at RM0.00 where empty.
- An Add Transaction button opens the same dialog as the Transactions page, with the date starting on today whichever month is shown. Saving refreshes the Dashboard.
- `GET /api/dashboard?month=YYYY-MM` sums the month in Postgres, scoped to the user, and answers `{ month, totals: { income, expense }, expenseCategories: [{ category: { id, name, archived }, total }] }`, with `expenseCategories` already in display order. `month` is required. Any other parameter, a malformed `month`, or one outside the bounds gives 400, as for `GET /api/transactions`. Slices 4 and 5 add their figures to this answer.
- Design: build the Dashboard with the `frontend-design` skill and restyle the header to match, within the slice 1 theme and its tests. The page may grow wider than the current 768 px if the Dashboard needs it. Keep top navigation; on a phone, slice 6 replaces it with tabs (see "The phone layout"). The PR carries light and dark screenshots.

### Categories

- Every Category is either Income or Expense. Budgets apply only to Expense Categories.
- Categories are one level deep (no subcategories).
- Deleting a Category **archives** it: it's hidden from pickers, but old Transactions keep it and past totals don't change.
- The starter sets are written when the user is created, by Better Auth's after-create hook (which runs once the sign-up transaction has committed). As a backstop, loading Categories for a user who has none at all, archived included, writes the starter sets then. Both paths call one function that is safe to run twice, even at the same moment (it locks the user's row while checking). A user who archives everything does not get the starter sets back. If writing them at sign-up fails, sign-up still answers as usual, because an error only for a new email would show which emails have accounts; the failure is logged and the first load writes them.
- `GET /api/categories` returns the user's Categories that aren't archived as `{ income: [...], expense: [...] }`, each list in position order, each Category as `{ id, name, kind }`.
- Each Category stores its position. The starter sets keep the order listed below, with "Other" last. Adding, renaming, archiving, restoring and reordering Categories come in Settings (slice 6, see "Settings"); slice 2 has the starter sets only.
- Starter sets:
  - **Income:** Salary, Bonus, Side income, Other
  - **Expense:** Food, Transport, Housing, Utilities, Bills & Subscriptions, Shopping, Health, Entertainment, Family, Other

### Budgets

- Budgets are monthly only. A month shows a per-day figure for what's left (e.g. RM420 left ÷ 12 days = RM35/day).
- Each Category's limit carries forward to later months until it is changed or removed for that Category ([ADR 0007](adr/0007-budgets-stored-as-changes-per-category.md)). Editing November leaves October unchanged.
- Unspent or overspent money **does not** carry over. Every month starts fresh.
- If the Budgets don't fit the month's Expected Income, show a warning. Don't block it. (Slice 5; the exact test is under "The Dashboard in slice 5", as comparing with Free to Spend would count a Commitment in a budgeted Category twice.)

Decided on 2026-10-28, for slice 4.

- **Stored as changes**: a Budget is a list of changes for one Expense Category, each saying "from this month, the limit is X" or "from this month, there is no limit". A month's limit is the latest change at or before it; nothing is stored per month. Editing a month changes it and every later month up to that Category's next change, and never an earlier month.
- Any month the Dashboard can show can be edited, past ones included; like a refund, that changes how the month looks, because it is what was really planned. Saving the limit a month already has stores nothing. A Category has at most one change per month, so saving again replaces it. Whichever save comes last wins, with no conflict warning.
- A new user has no Budgets. There is no starter set.
- **Limit**: the same rules as a Transaction's amount: the same parser, 1 minor unit up to the same maximum, more decimal places than the currency has refused, never rounded. Zero is not allowed; a blank field means no limit.
- **Overspent**: a Budget whose month's Expenses have gone past its limit. This is slice 4's warning, shown on the Category's row. Spending exactly the limit is not Overspent.
- **Setting Budgets**: an Edit Budgets button on the Dashboard, always shown, opens a dialog (a sheet on a phone) titled with the month ("Budgets for October 2026"). It lists every Expense Category that isn't archived, in position order, each field starting on that month's limit, whether set that month or carried forward. Clearing a carried limit removes it from that month onwards. An invalid field says what's wrong in words, and nothing is saved until every field is valid. Saving closes the dialog and refreshes the Dashboard.
- **Archived Categories**: no Budget is ever written for one in slice 4, as archiving arrives with Settings. From slice 6 (decided 2026-10-31), archiving a Category ends its Budget from this month, in the user's time zone: in the same transaction, it stores a "no limit" change for this month (nothing, if the month already has no limit) and removes the Category's changes for later months. Earlier months keep their limits, because that is what was really planned, and the Dashboard still shows those rows as "Food (archived)", with limit, bar and Overspent, and counts them in the Budgets warning. The Edit Budgets dialog never lists an archived Category, and `PUT /api/budgets` still refuses one. Restoring a Category doesn't bring its Budget back.
- **Per day**: on the Dashboard, for this month only, a budgeted row that isn't Overspent shows its money left ÷ the days left in the month, counting today, in the user's time zone. It rounds down to a whole minor unit, so it never shows more than is really left. Past and future months show no per-day figure. The Transactions page shows no Budget figures in slice 4; slice 6 adds them for a filtered Month (see "Polish").
- **Shown as**: a budgeted row shows its limit, a progress bar and where it stands in words: "RM420.00 left" in green, or "Overspent by RM40.00" in red. Exactly the limit reads "RM0.00 left", in green. The bar fills to the share of the limit spent, at most the whole width; an Overspent bar fills the whole width in red. A row without a Budget has no bar and no colour. There is no amber state, because only the two Budget tokens exist.
- `GET /api/budgets?month=YYYY-MM` answers every Expense Category that isn't archived, in position order, with that month's limit: `[{ category: { id, name }, limit }]`, where `limit` is `null` for no limit. `month` follows the Dashboard's rules: required, and any other parameter, a malformed `month`, or one outside the bounds gives 400.
- `PUT /api/budgets?month=YYYY-MM` takes `{ limits: [{ categoryId, limit }] }`, `limit` being a number or `null`, and applies each from that month onwards in one transaction. A Category that is another user's, archived, an Income Category, doesn't exist, or whose ID isn't an ID gives 404 `CATEGORY_NOT_FOUND`, the same as for adding a Transaction. The same Category listed twice gives 400. The per-user write limit applies.
- Stored in a `budgets` table: `user_id`, `category_id`, the month the change starts from, and the limit (`bigint`, or null for no limit). Unique per user, Category and month. Its foreign key covers `(user_id, category_id)`, as a Transaction's does, so the database refuses a Budget on another user's Category.
- Recurring Transactions and Estimates count towards Budgets from slice 5, because they are real Transactions; nothing in slice 4 needs to change for that.

### Recurring Transactions

- Schedules: monthly on day N, weekly on a weekday, yearly on a date. Day 31 in a shorter month falls back to that month's last day.
- A Recurring Transaction creates the real Transaction **on its due date**, not at the start of the month. Commitments and Expected Income are calculated directly from the Recurring Transactions, so planning still sees the whole month.
- Variable amounts create an **Estimate**. It counts in all totals and Budgets right away, marked as unconfirmed, until the user confirms the real amount.
- Editing a Recurring Transaction affects only Transactions it hasn't created yet. Past ones never change.
- Yearly items count as a Commitment only in the month they're due.

Decided on 2026-10-29, for slice 5.

- **Fields**: a Category (Income or Expense, as for a Transaction), an amount, an optional note, a schedule, a start date, and whether the amount varies. There is no name: the Category and the note identify it. The amount and note follow a Transaction's rules; when the amount varies, it is the Estimate's guess.
- **Schedules**: monthly on day 1–31, weekly on a weekday (Monday to Sunday), or yearly on a day and month (29 Feb allowed). A day the month doesn't have falls back to its last day: day 31 is 30 Apr, and 29 Feb is 28 Feb in a year without one.
- **Starting**: the start date runs from today up to one year after today, in the user's time zone, so nothing is ever backfilled; earlier ones are added by hand as ordinary Transactions. The first **Due Date** is the schedule's first one on or after the start date, and the form shows it ("First on Tue, 25 Nov 2026"). There is no end date.
- **Creating Transactions**: each time the user's Transactions, Dashboard or Recurring Transactions are loaded, every Due Date on or before today, in the user's time zone, that hasn't been created yet is created first, dated on its Due Date ([ADR 0008](adr/0008-recurring-transactions-created-on-read.md)). After a long absence every missed Due Date is created at once. A Recurring Transaction keeps its next Due Date, which moves on as Transactions are created; whether a Transaction exists for a Due Date is never checked. These writes don't count towards the write limit.
- **Skipping**: delete that Due Date's Transaction. It is never created again. There is no skip button.
- **Editing** changes only Transactions not yet created. A schedule change never creates a second Transaction in a period that already has one: the next Due Date becomes the new schedule's first one on or after the start of the period (month, week or year, under the old schedule) after the last Due Date created, or on or after the start date when none has been, and never before today. Rent created on 1 Nov and moved to the 5th on 3 Nov is next due on 5 Dec. There is no start date on edit.
- **Stopping**: after a confirmation step, a Recurring Transaction is stopped: it is kept, creates nothing more, and can't be edited or restarted (add a new one) ([ADR 0009](adr/0009-recurring-transactions-stopped-not-deleted.md)). It leaves Upcoming and every later month at once, including later Due Dates this month. Anything due up to today is created first, so stopping on a Due Date keeps that day's Transaction, as it would had the page been loaded earlier that day. The Transactions it created stay, as ordinary Transactions.
- **Limit**: at most 100 Recurring Transactions that aren't stopped per user, so catching up stays cheap. Adding the 101st is refused with 409 `RECURRING_LIMIT`.
- **The Transactions it creates** are ordinary Transactions with a link back: they can be edited and deleted, they count towards Budgets once created (never before), and they follow their own date and Category. One moved to another month counts as a Commitment there; one moved to an Income Category counts towards Expected Income instead.
- **Estimates**: when the amount varies, each Transaction is created as an Estimate holding the guess. Either kind can vary. An Estimate counts in every total, Budgets included, straight away. Saving it from the edit dialog confirms it, whatever changed; the dialog is titled "Confirm Estimate", says "This is an Estimate. Saving confirms the amount." and its button reads "Confirm amount". The guess for later Due Dates doesn't change on its own.
- **Archived Categories**: a Recurring Transaction can't be put under one (404, as for a Transaction). Keeping the archived Category it has is allowed. From slice 6 (decided 2026-10-31), a Category can't be archived while a Recurring Transaction that isn't stopped uses it: archiving is refused with 409 `CATEGORY_HAS_RECURRING`, and Settings names the Recurring Transactions to move to another Category or stop first. Stopping is never a side effect of archiving, because it can't be undone. Stopped ones don't block archiving.
- **The Recurring page** lives at `/recurring`, linked from the header (Dashboard · Transactions · Recurring) and from the Dashboard's Upcoming heading. It lists the Recurring Transactions that aren't stopped by next Due Date, each with its Category, note, schedule ("Every month on the 25th", "Every Monday", "Every year on 29 Feb"), amount ("+" for Income) and next Due Date, and marks the ones whose amount varies with "Varies" (Estimate is a Transaction's word). Stopped ones sit under a collapsed "Stopped" heading, read-only. Adding and editing happen in a dialog (a sheet on a phone), as for Transactions.
- **On the Transactions page**, rows show a small recurring marker and an "Estimate" label where they apply. Due Dates not yet created are never shown there; planning belongs on the Dashboard.
- As built in slice 5: `GET /api/recurring` answers `{ active, stopped }`; `POST /api/recurring` adds one (201); `PATCH /api/recurring/:id` changes any of Category, amount, note, schedule and whether it varies; `POST /api/recurring/:id/stop` stops it (204, and again for one already stopped). One that isn't the user's, doesn't exist, whose ID isn't an ID, or that is stopped (for `PATCH`) gets 404 `RECURRING_NOT_FOUND`. A schedule is `{ frequency: 'monthly', day }`, `{ frequency: 'weekly', weekday }` (1 for Monday to 7 for Sunday) or `{ frequency: 'yearly', month, day }`. Transactions gain `recurringTransactionId` (or `null`) and `estimate`. There is no separate confirm endpoint: `PATCH /api/transactions/:id` confirms an Estimate.
- Stored in a `recurring_transactions` table: `user_id`, `category_id`, amount, note, frequency and its day, weekday or month, whether it varies, start date, next Due Date, last Due Date created, and when it was stopped. Its foreign key covers `(user_id, category_id)`. `transactions` gains `recurring_transaction_id` and `due_date` (the Due Date it was created for, which never changes when its date is edited), with a foreign key covering `(user_id, recurring_transaction_id)`, so the database refuses a link to another user's Recurring Transaction, and `estimate`. Transactions are unique per Recurring Transaction and Due Date, so two loads catching up at once can't both create one; catching up also locks the Recurring Transactions it moves on.

### The Dashboard in slice 5

Decided on 2026-10-29.

- **Remaining** is the headline, with its per-day figure underneath. Below zero, it reads "Over by RM240.00", in ink: red and green stay with Budgets. The per-day figure follows the Budget rule: this month only, Remaining ÷ the days left counting today, rounded down to a whole minor unit, and none when Remaining is zero or less.
- Beside it, four figures: **Expected Income** (with "RM3,000.00 recorded" underneath), **Commitments**, **Free to Spend** and Expenses. Expected Income's recorded figure and Expenses open that Month's Transactions, as the slice 3 totals did.
- Then Expenses by Category with its Budgets, as in slice 4, and beside it **Upcoming** and **Estimates to confirm**.
- **Upcoming** lists the shown month's Due Dates not yet created, in date order, with date, Category, note and amount, Estimates marked. It is empty for past months (everything due has been created), holds what's left of this month, and holds every Due Date of a future month. When there are none it says so.
- **Estimates to confirm** lists every unconfirmed Estimate, of any month, oldest first, whichever month is shown, so a forgotten one keeps asking. Each opens the edit dialog to confirm it. The list is hidden when there are none.
- **The Budgets warning**: when the shown month's Budgets plus its Commitments in Categories without a Budget come to more than Expected Income, an ink warning above the Budget rows says "Budgets and Commitments come to RM320.00 more than Expected Income." A Commitment in a budgeted Category is covered by that Budget, so nothing is counted twice. The Edit Budgets dialog shows the same warning as limits are typed. It never blocks saving.
- `GET /api/dashboard` gains `plan: { expectedIncome, commitments, freeToSpend, remaining }`, `commitmentsByCategory` (Expense Category ID to its Commitments), `budgetsOverBy` (or `null`), `upcoming` and `estimates`. The per-day figure is worked out in the browser, as for Budgets, so it moves on at the user's midnight.

### Dashboard maths (for one month)

```
Expected Income = Income recorded + recurring Income still due this month
Commitments     = Expenses scheduled by Recurring Transactions this month
Free to Spend   = Expected Income − Commitments
Remaining       = Free to Spend − Expenses not created by Recurring Transactions
Per day         = Remaining ÷ days left in the month
```

Worked out from the month's Transactions and the Due Dates not yet created:

- "Income recorded" is every Income Transaction dated in the month, recurring or not. "Recurring Income still due" is the month's Upcoming Income, at each Recurring Transaction's amount.
- "Expenses scheduled by Recurring Transactions" are the Expenses already created by one, at their current amounts, plus the month's Upcoming Expenses. So confirming or editing flows through, and a deleted (skipped) one drops out.
- Every figure counts Transactions dated later this month, as the slice 3 totals do.

### Settings

Decided on 2026-10-31, for slice 6.

- Lives at `/settings`, opened from the user menu, not the header's links. Sections, in order: Profile, Password, Time zone, Currency, Categories.
- **Profile**: name, editable, with the sign-up rules (saved through Better Auth's `/update-user`, so `INVALID_NAME` applies). Email is shown, not editable.
- **Password**: the current password and a new one, through Better Auth's `changePassword` with `revokeOtherSessions: true`. The new password follows the sign-up rules, breach check included. A wrong current password reads "Current password is wrong". This session stays signed in; every other session is signed out. Better Auth's own rate limit applies. No email is sent until slice 7.
- **Time zone**: a searchable list of IANA time zones, and a "Use this device's time zone (Asia/Tokyo)" button. Saved through `/update-user`, which already refuses an unknown zone or a fixed offset. Transaction dates don't change, as they are calendar dates; from then on, today, Periods, Budgets' per-day figures and catching up on Recurring Transactions follow the new zone, and every page reloads its data. There is no prompt when the device's zone differs from the saved one, so travelling doesn't nag or move today around.
- **Currency**: shown, read-only, as now.
- **Categories**: an Income list and an Expense list, each in position order, each row with Rename, up and down buttons, and Archive, and an Add button per kind. Under them, a collapsed "Archived" heading lists archived Categories with a Restore button each; they can't be renamed or moved until restored.
- **Names**: trimmed, 1 to 40 characters, unique within the kind, ignoring case, archived Categories included (an Income "Other" and an Expense "Other" can both exist). A clash gives 409 `CATEGORY_NAME_TAKEN`; when the clash is with an archived Category, the message says "You have an archived Category called Food. Restore it instead." Renaming follows the same rules; changing only the capitals ("food" to "Food") is allowed. The database enforces the uniqueness too, so two saves at once can't both succeed.
- **Kind** is chosen when adding and fixed afterwards ([ADR 0005](adr/0005-category-decides-income-or-expense.md)).
- **Order**: the up and down buttons swap a Category with its neighbour in the same kind, saved at once. "Other" isn't pinned. A new or restored Category goes last in its kind. Order applies to pickers, the Edit Budgets dialog and the Dashboard's tie-break.
- **Archiving**: after a confirmation step: "Archive Food? It's hidden from pickers; past Transactions keep it." When the Category has a Budget this month or later, it adds "Its RM800.00 Budget ends from October 2026." What it does to Budgets is under Budgets, and to Recurring Transactions under Recurring Transactions. Archiving the last Category of a kind that isn't archived is refused with 409 `LAST_CATEGORY`, so an Add dialog always has a Category to pick. Restoring needs no confirmation.
- **Limit**: at most 50 Categories that aren't archived per kind. Adding or restoring past it is refused with 409 `CATEGORY_LIMIT`.
- API: `GET /api/categories` gains `archived: { income, expense }`, so Settings makes one request. `POST /api/categories` takes `{ name, kind }` (201). `PATCH /api/categories/:id` takes `{ name }`. `POST /api/categories/:id/archive` and `POST /api/categories/:id/restore` answer 204, and 204 again when repeated. `POST /api/categories/:id/move` takes `{ direction: 'up' | 'down' }` and swaps positions in one transaction that locks the user's Categories, so two quick presses can't tangle the order; moving the first up or the last down changes nothing. A Category that is another user's, doesn't exist, or whose ID isn't an ID gives 404 `CATEGORY_NOT_FOUND`, as does renaming or moving an archived one. Every one of them goes through the per-user write limit.

### The phone layout

Decided on 2026-10-31, for slice 6. Desktop is unchanged.

- Below `sm`, a bottom tab bar holds Dashboard · Transactions · Recurring, clear of the phone's home indicator (safe-area insets). A slim top bar keeps the app name and the user menu.
- A floating Add Transaction button sits above the tab bar on every signed-in page except Settings. It opens the Add dialog (a sheet on a phone) dated today, or, on the Transactions page, on the Day being viewed, as the page's own button does. The Dashboard's month doesn't change the date. On desktop each page's own Add button is enough, so there is no floating button.
- Every signed-in page and dialog works at 360 px wide with no sideways scrolling. Tab bar and Add button targets are at least 44 px. Rows that don't fit (Transactions, Upcoming, Recurring) put the amount under the name rather than shrinking the text.
- The PR carries phone and desktop screenshots, light and dark.

### Polish

Decided on 2026-10-31, for slice 6.

- **Budget on the Transactions page**: a Month filtered to an Expense Category with a Budget that month shows a Budget strip under the totals: limit, bar, "RM420.00 left" or "Overspent by RM40.00", and for this month the per-day figure, exactly as the Dashboard's row and with the same shared maths. Day and Week, an unfiltered Month, and an Income filter show none. `GET /api/transactions` gains `budget` (the month's limit, or `null`) when `period` is `month` and the filter is an Expense Category, archived ones included, so a past month of an archived Category shows its Budget.
- **Not found**: an unknown address shows a "Page not found" page with a link to the Dashboard.
- **Page titles**: each page sets its tab title: "Dashboard · For Wealth", "Transactions · For Wealth", "Recurring · For Wealth", "Settings · For Wealth", "Sign in · For Wealth", and so on.
- **Errors**: when a page's data can't be loaded (no connection, or the API fails), the page says so in words with a Try again button, instead of staying blank. A session that has ended sends the user to sign in, back to the same page after.
- **Empty states**: every list that can be empty says what goes there and offers the action that fills it: a Period with no Transactions, no Recurring Transactions, a Dashboard month with nothing recorded.

## Architecture

One pnpm monorepo ([ADR 0003](adr/0003-pnpm-monorepo.md)):

```
for-wealth/
  apps/web          React 19 + Vite
  apps/api          Hono API
  packages/shared   types, Zod schemas, money and date helpers
```

| Concern | Choice |
|---|---|
| API framework | Hono |
| Database | PostgreSQL, via Drizzle ORM |
| Validation | Zod (shared by API and forms) |
| Auth | Better Auth: email + password, cookie sessions, email verification required |
| Email | Resend |
| Web → API calls | Hono RPC typed client |
| Styling / components | Tailwind CSS + shadcn/ui, with a custom theme (not the defaults) |
| Routing | TanStack Router |
| Loading API data | TanStack Query |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Dates | date-fns |
| Tests | Vitest |
| Dev database | Postgres on Neon, in a dev project separate from production ([ADR 0006](adr/0006-dev-database-on-neon.md)) |

### Setup decisions

Settled on 2026-10-20 from [the slice 1 research](research/better-auth-hono-drizzle-postgres.md), which has the setup details and sources.

| Decision | Choice |
|---|---|
| Versions | Drizzle ORM 0.45.x and drizzle-kit 0.31.x (not the 1.0 RC), Postgres 18, Hono 4, Better Auth 1.7. Check whether a Drizzle docs snippet is written for 1.0 before using it. |
| Postgres driver | `pg` (node-postgres) |
| Where database code lives | `apps/api/src/db/`. `packages/shared` never imports server-only code. |
| Schema changes | `drizzle-kit generate`, then `drizzle-kit migrate`. Migrations are committed. Never `push`. |
| IDs | `uuid`, generated by Postgres, for the auth tables (`advanced.database.generateId: "uuid"`) and every app table. Every `user_id` is a `uuid`. |
| Table names | Plural, so none is a reserved SQL word: `users`, `sessions`, `accounts`, `verifications` (`usePlural: true`), then `categories`, `transactions`, `budgets`, `recurring_transactions`. Columns are snake_case. |
| User record | `name` (asked for at signup), `currency` and `timeZone`. Currency is locked after signup by a Better Auth `before` hook on `/update-user`. Fields are validated with the shared Zod schemas through `validator.input`, or in the same hook if that doesn't work. As built in slice 1: `currency` and `timeZone` use `validator.input`. `name` is a core field, so a `before` hook checks it on `/sign-up/email` and `/update-user`. That hook and the currency lock live in a small plugin (`apps/api/src/user-rules.ts`), so their error codes (`INVALID_NAME`, `CURRENCY_LOCKED`) are part of the `Auth` type the web app matches on. `currency` defaults to MYR, but `timeZone` has no default, so an email sign-up without one is rejected instead of silently getting UTC. Time zones are stored in their canonical IANA spelling, and fixed offsets such as `+08:00` are refused because they have no daylight saving rules. |
| Breach check | If Have I Been Pwned can't be reached, sign-up fails with an error rather than skipping the check (the plugin's behaviour). Tests answer its range API with a stub and fail any other network request. |
| Response time of sign-up and reset requests | Every answer from `/sign-up/email` and `/request-password-reset` takes at least 1 second (`apps/api/src/response-floor.ts`). A new email also writes the user and their account, and a reset request for a known email writes a reset token, so without a floor the timing would show which emails have accounts. Better Auth holds its resend-verification endpoint to 500 ms for the same reason. The floor sits above a normal sign-up (password hash plus the breach check), the slower of the two, so a known and an unknown email both finish under it on either path. |
| Password reset | "Forgot password?" on the sign-in page leads to `/forgot-password`, which asks for an email; the answer is the same whether or not it has an account. The emailed link (not awaited, like every email) works once, within 1 hour, and lands on `/reset-password` with `?token=`, or with `?error=` when it was used, has expired or was mangled; the page then says the link no longer works and offers a new one. The new password follows the sign-up rules, breach check included. Better Auth spends the token, deletes every session of the user and saves the password in one transaction (`revokeSessionsOnPasswordReset`, the adapter's `transaction: true`). Two additions of ours (`apps/api/src/reset-tokens.ts`): reset tokens are stored as a SHA-256 hash, not as they appear in the link, so reading the database doesn't give anyone a working link; and a reset also spends any other reset link the user asked for. That last step runs after the transaction (Better Auth's `onPasswordReset`); if it fails, the new password still stands and the failure is logged. Resetting doesn't verify the email: an account that was never verified still has to verify before signing in. |
| Getting a new verification link | Signing up again sends nothing for an email that already has an account. A new link comes from the "Send a new link" form shown with an expired or broken link (Better Auth's `/send-verification-email`, which answers the same for any email) or from signing in before verifying (`sendOnSignIn`). |
| Origin checks in tests | Better Auth turns its own origin check off when `NODE_ENV` is `test`. It is set back on (`advanced.disableOriginCheck: false`), so the tests exercise what production runs. |
| Sessions | Database sessions with Better Auth's defaults (7 days, extended after 1 day of use). Cookie cache off, so a revoked session stops working immediately. Auto sign-in after verifying email. |
| Routes that need a session | API routes sit behind `requireSession` (`apps/api/src/require-session.ts`). It answers 401 without a valid session, gives handlers a non-null `user` (whose `id` every query on user data takes), marks the answer `Cache-Control: no-store`, and passes on the cookie Better Auth sets when it extends the session, so any API call keeps it alive. `GET /api/me` returns the user's own ID, name, email, currency and time zone. In the web app, pages that need a session live under the `_signed-in` layout route, whose `beforeLoad` reads `/api/me` and sends anyone else to `/sign-in?redirect=<path>`. |
| Where links land | Every Better Auth link (verification emails, the sign-in `callbackURL`) comes back to `/sign-in`, carrying `?redirect=` when the user was going somewhere. A signed-in user there is sent on to that path; a broken link arrives with `?error=` and the page offers a new one. `redirect` is followed only if it parses to a path on the app's own origin (`apps/web/src/lib/redirect.ts`), otherwise it goes to `/`. |
| Wrong sign-in details | One message for a wrong password and an unknown email. Better Auth hashes a dummy password for an unknown email, so the timing matches too, and it checks the password before the verification state, so only someone with the right password learns an email is waiting to be verified (403, and a fresh link is sent). |
| Dev URLs | `BETTER_AUTH_URL` is the Vite address (`http://localhost:5173`), so cookies and email links go through the proxy. Slice 1 isn't done until clicking a verification link from the console signs the user in. |
| Web ↔ API types | `apps/web` imports types only from `@for-wealth/api`. Switch to compiled `.d.ts` files if the editor slows down. Hono, Better Auth and Zod versions are shared through a pnpm catalog. |
| Node | `engines` is `>=22.12`. |

### Running locally (until launch)

The app runs on the author's machines until it's ready for friends. No domain or app hosting is needed before then.

- The database is a Neon dev project, shared by every machine. It holds a `for_wealth` database for development, plus `for_wealth_test` on a machine that runs the tests locally (CI always runs them on its own Postgres). Which database production uses is decided at launch.
- `pnpm dev` runs the web app and the API side by side. Vite proxies `/api/*` to the API, so the browser sees one address, just like production.
- Emails (verification, password reset) are printed to the API console instead of being sent. Resend is wired in only for production.

### Hosting (at launch)

One service at one address: the API serves the built web app, and data lives under `/api/*`. Deployed to Railway, Render or Fly.io, with managed Postgres (Neon or the host's own). One address means no CORS setup and simple login cookies.

Before inviting friends (slice 7):

- Delete account, in Settings: after a confirmation step, removes the user and all their data in one delete (see Data and security).
- A "your password was changed" email, sent through Resend whenever the password is changed or reset.
- Rate-limit counters (Better Auth's and the per-user write limit) are stored in the database, not in memory, so they survive restarts.
- The client IP used for rate limiting is read from the host's proxy header, configured so it can't be faked.
- Migrations run as a separate database role. The app's role can read and write data but can't change the schema.
- A strict Content-Security-Policy on the served web app.
- Automatic dependency-update PRs (Renovate or Dependabot).

### Data and security

- All data is stored in Postgres behind our own API ([ADR 0002](adr/0002-server-backed-from-day-one.md)).
- **Every table holding user data has a `userId`, and every query is scoped to it.** Make the user ID a required parameter so that forgetting it is a type error. One user reading another's data is the biggest risk in this app. This is enforced in the API, not with Postgres row-level security ([ADR 0004](adr/0004-user-data-isolation-in-api.md)).
- Every app table's `user_id` references `users` with `ON DELETE CASCADE`. "Delete my account" removes the user and all their data in one delete.
- A Transaction's Category must belong to the same user, enforced by the database as well as the API: the foreign key covers both `user_id` and `category_id`.
- An ID that belongs to someone else gets **404**, exactly like an ID that doesn't exist, so nobody can probe for other users' IDs.
- Adding, editing and deleting user data is limited to 60 requests a minute per user (counters in memory until slice 7). Requests to `/api/*` larger than 16 KB are refused before they are read. As built in slice 2 (`apps/api/src/write-limit.ts`): a sliding window, so no 120-request burst can straddle a minute boundary; every write counts, invalid and refused ones included; over the limit gives 429 with `Retry-After`. Each app router that writes user data adds `.use(limitWrites)` after `requireSession`; Better Auth's routes keep their own limits.
- HTTPS only. Secrets go in environment variables and are never committed.
- Environment variables are checked with Zod at startup. The API refuses to start if `BETTER_AUTH_SECRET` is missing or shorter than 32 characters, and never falls back to Better Auth's default secret.
- Passwords: at least 10 characters, at most 128, and no rules about character types. (Lowered from 12 on 2026-10-21, by the author's choice. That is still above OWASP's minimum of 8, and the breach check below catches common short passwords.) Passwords found in known data breaches are rejected (Better Auth's `haveIBeenPwned` plugin). Resetting the password signs the user out everywhere.
- Signup and password reset never reveal whether an email has an account.
- All `/api/*` routes, not just Better Auth's, reject state-changing requests from other sites (Hono's `csrf()` middleware), as a second layer on top of `SameSite=Lax` cookies.
- Security headers on every response (Hono's `secureHeaders()`).
- Google sign-in is not in v1. If it is added later, it must not join a Google login onto an email + password account whose email was never verified. Otherwise, someone could register a victim's email with their own password before the victim ever signs in with Google. Check this in Better Auth's account-linking behaviour and cover it with a test. Google sign-ups must also confirm currency and time zone once before using the app, instead of silently getting MYR and UTC. `users.time_zone` is `NOT NULL` with no default (slice 1), so the Google sign-up has to supply one when the user is created, or creating the user fails.
- Supply chain: the pnpm lockfile is committed. pnpm's `minimumReleaseAge` is set to 3 days, so package versions published only hours ago aren't installed. Packages can't run install scripts unless they're explicitly allowed.
- Keep Better Auth updated.

## Testing

- Vitest tests in `packages/shared` for the money and date logic: Period boundaries, time zones, Free to Spend, Remaining, Budget usage, Recurring due dates (including day 31).
- API integration tests against a real Postgres, including **"user A cannot read or change user B's data"** for every endpoint that touches user data.
- Slice 2 tests: a new user has the starter sets, and a user with none gets them on first load; amounts outside the bounds or with too many decimal places are refused; dates outside the bounds (in the user's time zone) are refused; Day, Week and Month totals; a Transaction can't point at another user's Category (the API refuses it, and the database refuses it too); another user's Transaction or Category gives 404 for read, edit, delete and filter; the 61st write in a minute is refused; a request over 16 KB is refused.
- Slice 3 tests: a month's Income and Expense totals and its Expenses by Category, in order, with Categories that have no Expenses left out; an archived Category with Expenses that month is listed; Transactions dated later this month count; the share rounding, including "<1%"; a malformed, missing or out-of-bounds `month` and any other parameter give 400; another user's Transactions never appear in the totals or the list.
- Slice 4 tests: in `packages/shared`, how a limit carries forward (a change, a later change, a removal, a change to an earlier month), the per-day figure (rounding down, the last day of the month), and the bar's fill, Overspent included. Against the API: a month's limits come from the stored changes; editing November leaves October unchanged and reaches December; saving the same limit stores nothing; limits outside the bounds or with too many decimal places are refused; an archived, Income or other user's Category gives 404; a Category listed twice gives 400; a malformed, missing or out-of-bounds `month` and any other parameter give 400; a budgeted Category with no Expenses appears on the Dashboard; another user's Budgets never appear; the database refuses a Budget on another user's Category; the 61st write in a minute is refused.
- Slice 5 tests: in `packages/shared`, Due Dates for each schedule (day 31, 29 Feb, weekdays, across years), the first Due Date from a start date, the next Due Date after a schedule change, the month's plan (Expected Income, Commitments, Free to Spend, Remaining), and the Budgets warning. Against the API: catching up creates each missed Due Date once, dated on it, and a deleted one is never recreated; two loads at once create each once; an Estimate is created when the amount varies and saving it confirms it; editing changes only later Transactions, and a schedule change never doubles a period; a stopped one creates nothing more and leaves Upcoming; the month's figures, Upcoming and the warning; the start date's bounds; the 101st is refused; another user's Recurring Transaction gives 404 for edit and stop, never appears, and the database refuses a Transaction linked to it.
- Slice 6 tests. Against the API: adding, renaming, archiving, restoring and moving Categories; names trimmed, too long or empty refused, a clash in the same kind refused ignoring case, archived ones included, while the same name in the other kind is allowed; the 51st Category of a kind refused, for adding and for restoring; archiving the last Category of a kind refused; archiving with a Recurring Transaction that isn't stopped refused, and a stopped one doesn't block it; archiving ends the Budget from this month in the user's time zone, removes later changes, leaves earlier months' limits on the Dashboard as archived rows and in the Budgets warning; restoring brings no Budget back and puts the Category last; renaming or moving an archived Category gives 404; moving the first up or the last down changes nothing, and two moves at once leave a clean order; another user's Category gives 404 for every endpoint; the write limit applies; a filtered Month of the Transactions page answers the Category's `budget`; changing the time zone moves today and the next catch-up; changing the password refuses a wrong current password and a breached new one, keeps this session and signs out the others.
- API tests use a separate `for_wealth_test` database (`TEST_DATABASE_URL`), run one file at a time (`fileParallelism: false`) and empty the tables between tests. A test signs in by signing up, marking the email verified in the database, then signing in.
- Slice 1 auth tests: no session gives 401, sign-in before verifying gives 403, a verified sign-in works, currency can't be changed, a breached or short password is rejected, a cross-site POST is rejected, the verification email is sent, a signed-out session's cookie gives 401, a session in use is extended, and two users each see only their own details. Password reset: an unknown email gets the same answer as a known one, a valid link resets the password and the new one signs in while the old one doesn't, a session from before the reset gets 401, a used, expired or earlier link is refused, a weak new password is refused, and a failure while saving the password changes nothing.

## Build order

Each slice works all the way from the database to the screen.

1. Monorepo, API skeleton, Postgres, Better Auth (email + password, verification, password reset), login screen. Runs locally only.
2. Categories (starter sets), adding and editing Transactions, the Transactions page with Day / Week / Month browsing. *You can use it every day from here.*
3. Dashboard totals for Income and Expenses.
4. Budgets (limits carry forward), progress bars, Overspent.
5. Recurring Transactions, Estimates, Commitments, Expected Income, Free to Spend, Remaining, Upcoming, and the warning when Budgets don't fit Expected Income.
6. Settings, polish, phone layout.
7. **First deploy**: hosting, managed Postgres, Resend, domain (optional), the "Before inviting friends" list under Hosting, delete account included. **Then invite friends.**

## Design

Use the `frontend-design` skill when building the UI. Replace shadcn/ui's default theme (colours, corner radius, font). Use one accent colour, and save red and green for over-Budget and under-Budget. For layout ideas, look at real finance apps (Copilot Money, Monarch, Lunch Money).

The theme (slice 1, decided 2026-10-21) lives as tokens in `apps/web/src/index.css`. Components use the tokens, never their own colours.

- **Accent**: batik indigo (`#3e4eb3` light, `#92a6f1` dark), for primary actions, links and focus. Neutrals are tinted with the same hue. Indigo is far from both red and green, so it never reads as a Budget signal.
- **Red and green**: the `over-budget` and `under-budget` tokens only. So `destructive` (delete buttons, invalid fields) is ink, not red: the wording ("Delete Transaction") and a confirmation step carry the warning, which also works for people who can't tell red from green. For the same reason, an invalid form field always says what's wrong in words, not only with its border.
- **Type**: Instrument Sans, bundled from npm. Headings use its width axis at 85% (narrower). All digits are tabular (the same width), so amounts line up.
- **Corners**: 0.375rem base radius, tighter than shadcn's default.
- **Light and dark**: follows the device setting, in CSS only. A manual switch can come later if wanted.
- **Checked by tests** (`apps/web/test/`): text contrast meets WCAG AA in both modes, red and green appear only in the Budget tokens, components hard-code no colours, the stylesheet loads nothing from another address, and transitions and animations stop when the device asks for reduced motion.
