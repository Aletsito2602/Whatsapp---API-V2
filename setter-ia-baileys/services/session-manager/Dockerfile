# Session Manager Service Dockerfile
FROM node:18-alpine

# Install system dependencies for Baileys and native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY services/session-manager/package*.json ./
COPY shared/types/package*.json ./shared/types/

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy shared types
COPY shared/types/ ./shared/types/
RUN cd shared/types && npm run build

# Copy source code
COPY services/session-manager/src ./src
COPY services/session-manager/tsconfig.json ./

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create directories and set permissions
RUN mkdir -p ./sessions ./logs && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the service
CMD ["npm", "start"]