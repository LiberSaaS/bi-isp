# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm install --omit=dev

# Copy source and scripts
COPY src/ ./src/
COPY scripts/ ./scripts/

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy from build stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Create logs directory and frontend-dist placeholder
RUN mkdir -p /app/logs /app/frontend-dist

# Copy frontend distribution (built outside Docker)
COPY frontend-dist/ ./frontend-dist/

# Expose API port
EXPOSE 3001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

# Start application
CMD ["node", "src/index.js"]
