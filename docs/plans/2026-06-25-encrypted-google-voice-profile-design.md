# Encrypted Google Voice Profile Archive Design

## Goal

Run the Google Voice bot on Render free without a persistent disk by restoring a pre-authenticated Google Voice browser profile at container startup.

## Recommended Approach

Use an encrypted profile archive committed to the repo. The encrypted file can safely travel with the deployment image, while the decryption password lives only in local/Render environment variables.

At startup, the app checks whether `GV_PROFILE_ARCHIVE_PATH` and `GV_PROFILE_ARCHIVE_PASSWORD` are set. If the target `GV_PROFILE_PATH` is missing or empty, it decrypts and extracts the archive into that location before Playwright opens Chromium.

## Components

- `scripts/archive-google-voice-profile.js`
  - Creates an encrypted tar archive from the local `.gv-profile` directory.
  - Requires `GV_PROFILE_ARCHIVE_PASSWORD`.
  - Writes `secrets/gv-profile.tar.gz.enc` by default.

- `scripts/restore-google-voice-profile.js`
  - Decrypts and extracts the archive into `GV_PROFILE_PATH`.
  - No-ops when archive/password are missing.
  - No-ops when the profile directory already contains files.

- `src/profile-archive.js`
  - Shared archive/restore helpers.
  - Uses Node built-ins only: `crypto`, `fs`, `zlib`, and `tar` shell command where available.

- `src/server.js`
  - Restores profile before starting the scheduler/server.

- `Dockerfile`
  - Copies the encrypted archive into the image if present.
  - Runs the same app command after restore logic.

## Data Flow

1. Locally, run the archive script against the currently logged-in `.gv-profile`.
2. Commit only the encrypted archive.
3. Set `GV_PROFILE_ARCHIVE_PASSWORD` in Render.
4. Render starts the container.
5. App restores the archive into `/tmp/gv-appointment-bot/google-voice-profile`.
6. Playwright launches using the restored profile.
7. Bot stays in `OBSERVATION_MODE=true` until live scan behavior is confirmed.

## Risks

- If Google invalidates the copied session, the archive must be regenerated.
- Anyone with both the encrypted archive and password can recover the browser profile.
- Free Render still has ephemeral SQLite/media state.
- Google may challenge the restored session due to cloud IP/location.

## Acceptance Criteria

- Raw `.gv-profile` is never committed.
- Archive restoration is skipped unless both archive path and password are present.
- Restore happens before any Google Voice browser launch.
- Tests cover missing env, non-empty target, and successful restore behavior.
- Render env contains only the password, not raw profile content.
