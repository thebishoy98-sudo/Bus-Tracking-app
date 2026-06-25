# Playwright-compatible image: Chromium + matching system deps are preinstalled
# under /ms-playwright, so the persistent Google Voice browser session runs
# without extra apt packages. Pin the tag to package-lock.json's Playwright version.
FROM mcr.microsoft.com/playwright:v1.61.0-jammy

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies first for better layer caching.
# better-sqlite3 v12 ships Linux prebuilds, so no compiler is needed.
COPY package*.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# All mutable state lives on the mounted /data disk (see render.yaml).
ENV DB_PATH=/data/data.db \
    GV_PROFILE_PATH=/data/google-voice-profile \
    MEDIA_PATH=/data/media \
    DIAGNOSTICS_PATH=/data/diagnostics \
    PORT=3000

EXPOSE 3000

# Start in observation mode by default (override OBSERVATION_MODE=false only
# after the live smoke test has validated parsing and recipient selection).
CMD ["node", "src/server.js"]
