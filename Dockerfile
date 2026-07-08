FROM node:20-slim AS frontend
WORKDIR /app

RUN npm install -g corepack@latest && corepack use pnpm@latest

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

FROM golang:1.25 AS backend
WORKDIR /app

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
COPY --from=frontend /app/dist ./ui/dist
RUN make

FROM scratch

COPY --from=alpine /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
# Provide a writable temp dir so large multipart uploads succeed (issue #44).
COPY --from=alpine --chmod=1777 /tmp /tmp
COPY --from=backend /app/main /bin/main

# Use the binary's built-in healthcheck instead of shipping curl (issue #48).
HEALTHCHECK --interval=5m --timeout=2s --retries=3 --start-period=15s CMD [ \
    "main", "-healthcheck" \
]

ENTRYPOINT [ "main" ]