# Build context: root repo (docker-compose.yml pakai context: .)
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM nginx:1.27-bookworm
# Paket novnc: sumber /usr/share/novnc/ (static vnc.html/JS), sama seperti bare-metal.
RUN apt-get update && apt-get install -y --no-install-recommends novnc \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
