# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN pnpm build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only (skip lifecycle scripts)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy built application
COPY --from=builder /app/dist ./dist

# Add labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/adamhancock/bullmq-mcp"
LABEL org.opencontainers.image.description="BullMQ MCP Server - Model Context Protocol for BullMQ Queue Management"
LABEL org.opencontainers.image.licenses="MIT"

# Set the entrypoint
ENTRYPOINT ["node", "dist/index.js"]