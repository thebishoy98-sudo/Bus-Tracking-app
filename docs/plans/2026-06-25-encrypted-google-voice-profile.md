# Encrypted Google Voice Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore an encrypted Google Voice browser profile into Render free ephemeral storage before Playwright starts.

**Architecture:** Add shared archive/restore helpers, CLI scripts for local archive generation and startup restore, and call restore before the server scheduler starts. The repo stores only encrypted profile bytes; Render stores only the password.

**Tech Stack:** Node.js ESM, built-in `crypto`, `fs`, `zlib`, `child_process`, Render Docker deployment.

---

### Task 1: Profile Archive Helper

**Files:**
- Create: `src/profile-archive.js`
- Test: `test/profile-archive.test.js`

**Step 1: Write failing tests**

Cover:
- restore no-ops when archive path/password is missing.
- restore no-ops when target profile already has files.
- archive then restore round-trips a sample profile file.

**Step 2: Run focused test**

Run:

```powershell
node --test test/profile-archive.test.js
```

Expected: fail because helper does not exist.

**Step 3: Implement helper**

Implement:
- `isDirectoryEmpty(path)`
- `encryptDirectory({ sourceDir, archivePath, password })`
- `restoreEncryptedProfile({ archivePath, targetDir, password })`

Use tar via `tar -czf - -C <sourceDir> .` piped into AES-256-GCM encrypted output. Store a small JSON header with salt, iv, and auth tag.

**Step 4: Run focused test**

Expected: pass.

---

### Task 2: CLI Scripts

**Files:**
- Create: `scripts/archive-google-voice-profile.js`
- Create: `scripts/restore-google-voice-profile.js`
- Modify: `package.json`

**Step 1: Add scripts**

Add:
- `profile:archive`
- `profile:restore`

**Step 2: Test command behavior**

Run archive without password and confirm it fails with a clear error. Run with password against a temp sample profile and confirm archive is created.

---

### Task 3: Startup Restore

**Files:**
- Modify: `src/server.js`
- Test: `test/server-startup-profile.test.js` if practical, otherwise focused helper tests plus syntax check.

**Step 1: Restore before server startup**

Import `restoreProfileFromEnv` and call it before cron/server boot.

**Step 2: Verify syntax**

Run:

```powershell
npm run lint
```

Expected: pass.

---

### Task 4: Deployment Config

**Files:**
- Modify: `.gitignore`
- Modify: `render.yaml`
- Modify: `Dockerfile`

**Step 1: Ignore raw secret/profile state**

Ensure `.gv-profile/`, `google-voice-profile/`, and unencrypted archive outputs remain ignored.

**Step 2: Allow encrypted archive**

Allow `secrets/gv-profile.tar.gz.enc`.

**Step 3: Configure Render env**

Add:
- `GV_PROFILE_ARCHIVE_PATH=/app/secrets/gv-profile.tar.gz.enc`
- `GV_PROFILE_ARCHIVE_PASSWORD` as `sync: false`

---

### Task 5: Generate Archive and Deploy

**Files:**
- Create: `secrets/gv-profile.tar.gz.enc`

**Step 1: Generate password locally**

Set or generate `GV_PROFILE_ARCHIVE_PASSWORD`.

**Step 2: Archive local profile**

Run:

```powershell
npm run profile:archive
```

**Step 3: Commit and push**

Run tests, commit source and encrypted archive, push to Render repo.

**Step 4: Set Render env**

Update Render service env with `GV_PROFILE_ARCHIVE_PASSWORD`.

**Step 5: Verify Render**

Wait for deploy, check `/healthz`, then inspect `/api/data` and logs. Expected next blocker is either Google challenge/login required or free memory pressure, not missing browser executable.
