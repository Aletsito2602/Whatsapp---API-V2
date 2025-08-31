# Message Gateway Service Dockerfile
FROM node:18-alpine

# Install system dependencies
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
    curl \
    vips-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY services/message-gateway/package*.json ./
COPY shared/types/package*.json ./shared/types/

# Install dependencies
RUN npm ci --only=production

# Copy shared types
COPY shared/types/ ./shared/types/
RUN cd shared/types && npm run build

# Copy source code
COPY services/message-gateway/src ./src
COPY services/message-gateway/tsconfig.json ./

# Build the application
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create directories and set permissions
RUN mkdir -p ./uploads ./logs && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Start the service
CMD ["npm", "start"]