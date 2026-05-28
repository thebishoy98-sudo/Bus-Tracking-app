# Expense Pagination And Filter Design

## Goal

Add payer filtering and pagination to the expense list so the user can quickly see what Allen, Bishoy, or Turo paid, while keeping the page comfortable on mobile screens.

## Approach

Use client-side filtering and pagination in `templates/index.html`. The app already loads the full expense list from `/api/expenses`, and the current dataset is small enough that server-side pagination would add unnecessary API complexity.

The expense view will include:

- A payer filter with `All`, `Allen`, `Bishoy`, and `Turo`.
- A page-size selector.
- Previous/next pagination controls with page counts.
- Mobile-first stacked controls and card-style expense rows.

Filtering resets the expense view to page 1. Deleting an expense reloads the list, preserves the current filter, and adjusts the current page if needed.

## Testing

Add standard-library `unittest` coverage for:

- `/api/expenses` still returns expenses in descending date order.
- The template contains the expected payer filter, pagination controls, and mobile media rules.

Manual browser verification will cover the interactive client-side behavior and mobile layout because the repo does not include a JavaScript browser test setup.
