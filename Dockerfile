FROM node:20-bookworm-slim

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

# better-sqlite3 may need native build tooling during install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./

RUN npm ci

ENV XDG_CONFIG_HOME=/app/config

RUN mkdir -p /app/data /app/config /app/.wwebjs_auth

CMD ["npm", "start"]
