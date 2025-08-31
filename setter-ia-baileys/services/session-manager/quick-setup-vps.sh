#!/bin/bash
# Script rápido para configurar en VPS

echo "🔧 Configuración Rápida en VPS"
echo "================================"

# Pedir datos al usuario
echo "📝 Ingresa los siguientes datos:"
read -p "🔑 Tu Gemini API Key: " GEMINI_KEY
echo ""

# Generar API Key segura
SECURE_API_KEY="sk-setter-prod-$(openssl rand -hex 16)"

# Crear .env.production actualizado
cat > .env.production << EOL
NODE_ENV=production
PORT=3001

# Supabase
SUPABASE_URL=https://bqitfhvaejxcyvjszfom.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA

# Gemini AI
VITE_GEMINI_API_KEY=${GEMINI_KEY}

# API Key de producción
SETTER_API_KEY=${SECURE_API_KEY}

# CORS
ALLOWED_ORIGINS=http://148.230.78.29:3001,https://148.230.78.29:3001

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Configuración de sesiones
MAX_CONCURRENT_SESSIONS=50
SESSION_TIMEOUT_MS=1800000
EOL

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Compilar TypeScript
echo "🔨 Compilando TypeScript..."
npx tsc simple-baileys.ts --target es2020 --module commonjs --outDir ./dist --allowSyntheticDefaultImports --esModuleInterop

echo ""
echo "✅ Configuración completada!"
echo "🔑 Tu API Key: ${SECURE_API_KEY}"
echo "📝 ¡GUARDA ESTA API KEY!"
echo ""
echo "🚀 Siguiente: docker-compose up -d"