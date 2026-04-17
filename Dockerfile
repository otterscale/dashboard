# Build stage
FROM node:24-alpine@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS builder

ARG VERSION=unknown

WORKDIR /src

# Install pnpm
RUN npm install -g pnpm

# Copy dependency files first for better caching
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY . .

# Set version environment variable
ENV VERSION=${VERSION}

# Build the application
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm build

# Prune to production dependencies only
RUN pnpm prune --production --ignore-scripts && pnpm store prune

# Runtime stage
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:f16acace4aa70086d4a2caad6c716f01e3e2fe0dd8274c4530c7c17d987bdb1a

WORKDIR /app

# Copy built application and production dependencies from builder
COPY --from=builder --chown=65532:65532 /src/build ./build
COPY --from=builder --chown=65532:65532 /src/node_modules ./node_modules
COPY --from=builder --chown=65532:65532 /src/package.json ./

# Switch to non-root user
USER 65532:65532

# Set environment variable
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Labels
LABEL maintainer="Chung-Hsuan Tsai <paul_tsai@phison.com>"

CMD ["./build"]