#!/bin/bash
# Script para preparar despliegue

echo "📦 Preparando archivos para despliegue..."

# Crear directorio de despliegue
mkdir -p deploy-package

# Copiar archivos esenciales
cp simple-baileys.ts deploy-package/
cp supaagentes.html deploy-package/
cp server-web.js deploy-package/
cp package.json deploy-package/
cp tsconfig.json deploy-package/
cp Dockerfile deploy-package/
cp docker-compose.production.yml deploy-package/
cp nginx.conf deploy-package/
cp .env.production deploy-package/
cp deploy.sh deploy-package/

# Copiar archivos de ayuda
cp *.js deploy-package/ 2>/dev/null || true
cp DEPLOYMENT-GUIDE.md deploy-package/

# Crear archivo de configuración para producción
cat > deploy-package/.env.production << EOL
NODE_ENV=production
PORT=3001

# Supabase - USAR TUS DATOS REALES
SUPABASE_URL=https://bqitfhvaejxcyvjszfom.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA

# Gemini AI - CAMBIAR POR TU CLAVE REAL
VITE_GEMINI_API_KEY=TU_GEMINI_API_KEY_AQUI

# API Key de producción - GENERAR NUEVA
SETTER_API_KEY=sk-setter-prod-$(openssl rand -hex 32)

# CORS - CAMBIAR POR TU DOMINIO
ALLOWED_ORIGINS=https://whatsapp.tu-dominio.com,https://tu-dominio.com

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=50
RATE_LIMIT_WINDOW_MS=60000
EOL

# Crear archivo de configuración Nginx actualizado
sed 's/tu-dominio.com/whatsapp.tu-dominio.com/g' nginx.conf > deploy-package/nginx-production.conf

# Crear tarball para subida
tar -czf setter-whatsapp-deploy.tar.gz deploy-package/

echo "✅ Archivos preparados en setter-whatsapp-deploy.tar.gz"
echo "📤 Siguiente: Subir al VPS"