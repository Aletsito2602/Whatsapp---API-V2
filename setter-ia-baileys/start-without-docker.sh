#!/bin/bash

echo "🚀 Iniciando Setter IA Baileys - Sin Docker"
echo "========================================="

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo "📝 Creando archivo .env..."
    cp .env.example .env
    
    # Configurar para uso sin Docker
    sed -i '' 's|postgresql://.*:5432/setter_baileys|sqlite://./data.sqlite|' .env
    sed -i '' 's|redis://.*:6379|memory://|' .env
    
    echo "✅ Archivo .env configurado para SQLite"
fi

# Crear directorios
mkdir -p logs sessions uploads media

# Instalar dependencias si es necesario
echo "📦 Verificando dependencias..."

# Session Manager
echo "🔧 Iniciando Session Manager..."
cd services/session-manager

# Establecer variables de entorno simples
export NODE_ENV=development
export SESSION_MANAGER_PORT=3001
export DB_TYPE=memory
export REDIS_TYPE=memory

# Iniciar en modo desarrollo
npm run dev &
SESSION_PID=$!

# Volver al directorio principal
cd ../..

echo ""
echo "🎉 Session Manager iniciado en puerto 3001!"
echo "PID: $SESSION_PID"
echo ""
echo "🌐 Para probar:"
echo "1. Abre test/whatsapp-test.html en tu navegador"
echo "2. Cambia la URL base a: http://localhost:3001"
echo "3. Usa API Key: test-api-key-12345"
echo "4. Crea una sesión y prueba!"
echo ""
echo "Para detener: kill $SESSION_PID"
echo ""

# Esperar y mantener el proceso activo
wait $SESSION_PID