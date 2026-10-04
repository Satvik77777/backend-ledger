# Production-grade multi-stage container for LedgerFlow Backend
FROM node:20-alpine AS production

# Install curl for container health check
RUN apk add --no-cache curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy application source code
COPY . .

# Run as non-root user for security best practices
USER node

# Expose backend API port
EXPOSE 3000

# Docker healthcheck pinging LedgerFlow health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
