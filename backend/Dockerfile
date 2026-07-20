# Build context: root repo (docker-compose.yml pakai context: .)
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# bcrypt itu native module -- toolchain build cuma dibutuhkan di stage ini.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app
# openssh-client -> ssh-keygen (bikin master key) + ssh client (node-ssh/ssh2 pakai library sendiri,
# tapi ssh-keygen tetap butuh binary openssh).
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m rsmpapp
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .
# Dilayani lewat GET /api/agent/download/:file (dipakai one-liner install di Settings).
COPY rs-agent/ scripts/agent/
COPY rs-agent-windows/ scripts/agent-windows/
RUN mkdir -p keys uploads isos && chown -R rsmpapp:rsmpapp /app
USER rsmpapp
EXPOSE 3001
CMD ["sh", "-c", "test -f keys/rs_master_key || ssh-keygen -t ed25519 -C rsmp-it-docker -f keys/rs_master_key -N ''; node src/index.js"]
