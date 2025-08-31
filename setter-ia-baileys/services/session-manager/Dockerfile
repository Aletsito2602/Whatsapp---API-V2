# Dockerfile para Producción - Optimizado para simple-baileys.ts
FROM node:18-alpine

# Instalar dependencias del sistema para Baileys
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
    git

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y instalar dependencias
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --only=production

# Copiar código fuente
COPY simple-baileys.ts ./
COPY supaagentes.html ./
COPY server-web.js ./
COPY *.js ./

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S setter -u 1001

# Crear directorios necesarios con permisos
RUN mkdir -p sessions auth_info_baileys logs && chown -R setter:nodejs /app

# Cambiar a usuario no-root
USER setter

# Exponer puertos
EXPOSE 3001 8080

# Health check mejorado
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
    CMD curl -f http://localhost:3001/health || exit 1

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3001

# Comando de inicio con tsx para TypeScript
CMD ["npx", "tsx", "simple-baileys.ts"]