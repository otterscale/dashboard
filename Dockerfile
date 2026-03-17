# Build stage
FROM node:25-alpine@sha256:5209bcaca9836eb3448b650396213dbe9d9a34d31840c2ae1f206cb2986a8543 AS builder

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
RUN pnpm build

# Prune to production dependencies only
RUN pnpm prune --production --ignore-scripts && pnpm store prune

# Runtime stage
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:56d532109c00500d7bf42b3c999e596b3ba546de15c704da1507aa02bba2f0ff

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