FROM node:20-bookworm-slim

WORKDIR /app

ARG OPENCODE_REMOTE_BUILD_ID=dev
LABEL org.opencontainers.image.revision=$OPENCODE_REMOTE_BUILD_ID

ENV PUPPETEER_SKIP_DOWNLOAD=true

# Keep runtime image lightweight; only install media codec runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Copy workspace manifests first so dependency install stays cached
# across normal source edits.
COPY apps/daemon/package.json ./apps/daemon/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/tui/package.json ./apps/tui/package.json
COPY packages/bridge/package.json ./packages/bridge/package.json

RUN npm ci

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./

ENV XDG_CONFIG_HOME=/app/config
ENV OPENCODE_REMOTE_BUILD_ID=$OPENCODE_REMOTE_BUILD_ID

RUN mkdir -p /app/data /app/config /app/.wwebjs_auth

CMD ["npm", "start"]
