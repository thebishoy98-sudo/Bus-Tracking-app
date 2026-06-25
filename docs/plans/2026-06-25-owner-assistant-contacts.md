# Owner Assistant Routing and Contacts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the owner line submit appointment-like job texts while keeping approval commands private, and create/update Google contacts named from the vehicle and job.

**Architecture:** Owner routing becomes content-aware: strict approval commands or pending clarification answers remain owner input, while appointment-looking texts from the owner number are processed as customer/job intake. Contact naming is deterministic from extracted `vehicle` and `service`. Google Contacts uses the People API through the existing Google OAuth client, with observation mode preventing writes until explicitly enabled.

**Tech Stack:** Node.js, built-in test runner, SQLite, googleapis People API, Google Calendar API, Google Voice browser/API adapter.

---

### Task 1: Owner line content-aware routing

**Files:**
- Modify: `src/router.js`
- Modify: `src/processor.js`
- Test: `test/router.test.js`
- Test: `test/processor-owner-assistant.test.js`

**Steps:**
1. Write failing tests showing owner number + approval command routes as owner, but owner number + appointment text routes as customer.
2. Add a routing helper that considers pending owner actions and strict approval command parsing.
3. Use that helper in `processInbound`.
4. Run focused tests.

### Task 2: Contact naming and People API wrapper

**Files:**
- Modify: `src/google.js`
- Create: `src/contacts.js`
- Test: `test/contacts.test.js`
- Test: `test/no-legacy-integrations.test.js`

**Steps:**
1. Write failing tests for contact display names such as `Toyota Highlander - Mounts`.
2. Add `https://www.googleapis.com/auth/contacts` to OAuth scopes.
3. Add a People API contact upsert helper that can be injected/mocked in tests.
4. Observation mode skips writes but records the contact name in message extraction.

### Task 3: Integrate contact upsert after extraction

**Files:**
- Modify: `src/processor.js`
- Test: `test/processor-observation.test.js`

**Steps:**
1. Write failing tests proving complete appointment/job extraction calls contact upsert only when observation mode is off.
2. Wire contact upsert after extraction, before/around booking.
3. Run focused tests, then full `npm test` and `npm run lint`.
