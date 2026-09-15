# Stage 1: Build Frontend
FROM node:26-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --production=false
COPY frontend/ ./frontend/
RUN cd frontend && npm run build:prod

# Stage 2: Build Backend
FROM node:26-alpine AS backend-build
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --production
COPY server/ ./server/
RUN cd server && npm run build

# Stage 3: Production
FROM node:26-alpine AS production
WORKDIR /app

# Install minimal system dependencies
RUN apk add --no-cache curl tini

# Copy backend
COPY --from=backend-build /app/server/dist ./server/dist
COPY --from=backend-build /app/server/node_modules ./server/node_modules
COPY --from=backend-build /app/server/package.json ./server/

# Copy frontend build
COPY --from=frontend-build /app/frontend/dist ./public

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/recipeapp.db
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=256
ENV UV_THREADPOOL_SIZE=2

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start server
CMD ["node", "server/dist/index.js"]
