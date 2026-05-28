# Expense Pagination And Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add payer filtering, pagination, and mobile-optimized controls to the expense list.

**Architecture:** Keep `/api/expenses` unchanged and apply filtering/pagination in the existing vanilla JavaScript view. Add focused `unittest` coverage for the API contract and rendered template structure, then manually verify the browser behavior.

**Tech Stack:** Flask, Flask-SQLAlchemy, vanilla JavaScript, CSS, Python `unittest`.

---

### Task 1: Add Regression Tests

**Files:**
- Create: `tests/test_app.py`
- Read: `app.py`
- Read: `templates/index.html`

**Step 1: Write the failing tests**

Create tests that assert `/api/expenses` returns rows in descending date order and the template includes payer filter, pagination controls, and mobile rules.

**Step 2: Run tests to verify failure**

Run: `python -m unittest tests.test_app -v`

Expected: template assertions fail because the new controls do not exist yet.

### Task 2: Implement Expense Controls

**Files:**
- Modify: `templates/index.html`

**Step 1: Add markup and styles**

Add an expense toolbar with payer and page-size controls, pagination buttons, summary text, and responsive stacked mobile styling.

**Step 2: Add client-side state and rendering**

Store all loaded expenses, filter by payer, slice by page, and render the current page. Reset to page 1 on filter or page-size changes.

**Step 3: Run tests**

Run: `python -m unittest tests.test_app -v`

Expected: all tests pass.

### Task 3: Verify Browser Behavior

**Files:**
- Read: `templates/index.html`

**Step 1: Start local server**

Run: `python app.py`

**Step 2: Open browser and inspect**

Use a real browser check at desktop and mobile widths. Confirm filter, page size, next/previous, delete reload, and mobile card layout.

### Task 4: Commit And Push

**Files:**
- Commit: `templates/index.html`
- Commit: `tests/test_app.py`
- Commit: `docs/plans/2026-05-28-expense-pagination-filter.md`

**Step 1: Review diff**

Run: `git diff --check` and `git status --short`.

**Step 2: Commit**

Run: `git add ...` and `git commit -m "feat: add expense filtering and pagination"`.

**Step 3: Push**

Run: `git push origin main`.
