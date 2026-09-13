# Build stage
FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS builder

ARG VERSION=unknown

WORKDIR /src

# Install pnpm
RUN npm install -g pnpm@10.33.0

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
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:ed5e65a1036b505c9e5abf0d0412ce0f70be1b812630bbbbaf49ce47edc7a513

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