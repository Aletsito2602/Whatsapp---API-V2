#!/bin/bash

# Script de despliegue para producción
set -e

echo "🚀 Iniciando despliegue a producción..."

# Verificar que existan las variables de entorno
if [ ! -f ".env.production" ]; then
    echo "❌ Error: .env.production no encontrado"
    exit 1
fi

# Cargar variables de entorno
export $(cat .env.production | grep -v '^#' | xargs)

echo "✅ Variables de entorno cargadas"

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Error: Docker no está instalado"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Error: Docker Compose no está instalado"
    exit 1
fi

echo "✅ Docker verificado"

# Build y deploy
echo "🔨 Construyendo imagen Docker..."
docker-compose -f docker-compose.production.yml build --no-cache

echo "🛑 Deteniendo servicios existentes..."
docker-compose -f docker-compose.production.yml down --remove-orphans

echo "🚀 Iniciando servicios..."
docker-compose -f docker-compose.production.yml up -d

echo "⏱️ Esperando que los servicios estén listos..."
sleep 30

# Verificar health
echo "🩺 Verificando health check..."
for i in {1..10}; do
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Servicio healthy!"
        break
    fi
    echo "⏳ Intento $i/10 - Esperando health check..."
    sleep 10
done

# Mostrar logs
echo "📋 Mostrando logs iniciales..."
docker-compose -f docker-compose.production.yml logs --tail=20

echo "🎉 ¡Despliegue completado!"
echo "📱 API WhatsApp: https://tu-dominio.com/api/v1/"
echo "🌐 Interfaz Web: https://tu-dominio.com/"
echo "🩺 Health Check: https://tu-dominio.com/health"