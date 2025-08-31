#!/bin/bash
# Script para configurar variables de producción

echo "🔧 Configurando variables de producción..."

# Leer variables del usuario
echo "📝 Configuración requerida:"
echo ""

read -p "🌐 Ingresa tu dominio (ej: whatsapp.tu-empresa.com): " DOMAIN
read -p "🔑 Ingresa tu Gemini API Key: " GEMINI_KEY
read -s -p "🔐 Ingresa tu Supabase Anon Key: " SUPABASE_KEY
echo ""

# Generar API Key segura
SECURE_API_KEY="sk-setter-prod-$(openssl rand -hex 16)"

# Crear archivo .env.production actualizado
cat > .env.production << EOL
NODE_ENV=production
PORT=3001

# Supabase
SUPABASE_URL=https://bqitfhvaejxcyvjszfom.supabase.co
SUPABASE_ANON_KEY=${SUPABASE_KEY}

# Gemini AI
VITE_GEMINI_API_KEY=${GEMINI_KEY}

# API Key de producción
SETTER_API_KEY=${SECURE_API_KEY}

# CORS
ALLOWED_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=50
RATE_LIMIT_WINDOW_MS=60000

# Configuración de sesiones
MAX_CONCURRENT_SESSIONS=50
SESSION_TIMEOUT_MS=1800000
EOL

# Actualizar nginx.conf con el dominio real
sed -i "s/whatsapp.tu-dominio.com/${DOMAIN}/g" nginx.conf

# Actualizar docker-compose con variables
sed -i "s/SETTER_API_KEY=\${SETTER_API_KEY}/SETTER_API_KEY=${SECURE_API_KEY}/g" docker-compose.production.yml

echo ""
echo "✅ Configuración completada!"
echo "🔑 Tu API Key de producción: ${SECURE_API_KEY}"
echo "📝 ¡GUARDA ESTA API KEY EN LUGAR SEGURO!"
echo ""
echo "📋 URLs de tu aplicación:"
echo "🌐 Interfaz: https://${DOMAIN}"
echo "📱 API: https://${DOMAIN}/api/v1/"
echo "🩺 Health: https://${DOMAIN}/health"
echo ""