# Build stage
FROM node:25-alpine@sha256:cf38e1f3c28ac9d81cdc0c51d8220320b3b618780e44ef96a39f76f7dbfef023 AS builder

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
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:924918584d0e6793e578fc0e98b8b8026ae4ac2ccf2fea283bc54a7165441ccd

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