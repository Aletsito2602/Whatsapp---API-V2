#!/bin/bash

# Setter IA Baileys - Development Startup Script

echo "🚀 Iniciando Setter IA Baileys - Desarrollo"
echo "========================================="

# Verificar si Docker está corriendo
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker no está corriendo. Por favor inicia Docker Desktop."
    exit 1
fi

# Verificar si existe el archivo .env
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env desde .env.example..."
    cp .env.example .env
    echo "✅ Archivo .env creado. Puedes editarlo si necesitas cambiar la configuración."
fi

# Crear directorios necesarios
echo "📁 Creando directorios necesarios..."
mkdir -p logs sessions uploads media nginx/ssl

# Instalar dependencias si es necesario
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm run install:all
fi

# Construir tipos compartidos
echo "🔧 Construyendo tipos compartidos..."
cd shared/types && npm run build && cd ../..

# Iniciar servicios con Docker Compose
echo "🐳 Iniciando servicios con Docker Compose..."
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d postgres redis

# Esperar a que los servicios base estén listos
echo "⏳ Esperando a que PostgreSQL y Redis estén listos..."
sleep 10

# Verificar que los servicios estén funcionando
echo "🔍 Verificando servicios..."

# Verificar PostgreSQL
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL está listo"
else
    echo "❌ PostgreSQL no está respondiendo"
    exit 1
fi

# Verificar Redis
if docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis está listo"
else
    echo "❌ Redis no está respondiendo"
    exit 1
fi

# Inicializar base de datos si es necesario
echo "📊 Inicializando base de datos..."
docker-compose exec -T postgres psql -U postgres -d setter_baileys -f /docker-entrypoint-initdb.d/init.sql > /dev/null 2>&1

echo ""
echo "🎉 ¡Servicios base iniciados exitosamente!"
echo ""
echo "Para continuar, puedes:"
echo "1. 🏃‍♂️ Iniciar todos los servicios: make docker-up"
echo "2. 🔧 Desarrollo local: npm run dev"
echo "3. 🧪 Abrir interfaz de prueba: test/whatsapp-test.html"
echo ""
echo "URLs útiles:"
echo "- Session Manager: http://localhost:3001"
echo "- Message Gateway: http://localhost:3002" 
echo "- PgAdmin: http://localhost:8080 (admin@example.com / admin)"
echo "- Redis Commander: http://localhost:8081 (admin / secret)"
echo ""
echo "🔑 API Key para pruebas: test-api-key-12345"

# Abrir interfaz de prueba automáticamente si está disponible
if command -v open >/dev/null 2>&1; then
    echo "🌐 Abriendo interfaz de prueba..."
    open test/whatsapp-test.html
elif command -v xdg-open >/dev/null 2>&1; then
    echo "🌐 Abriendo interfaz de prueba..."
    xdg-open test/whatsapp-test.html
fi