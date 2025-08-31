#!/bin/bash

# Script para conexión completamente fresca
echo "🔄 FRESH START - Conexión completamente nueva"
echo "============================================="

API_URL="http://localhost:3001"
SESSION_NAME="fresh$(date +%s)"

echo "💀 1. Matando TODOS los procesos relacionados..."
pkill -f "simple-baileys.ts" || true
pkill -f "tsx" || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "🗂️ 2. Eliminando TODOS los directorios de sesión..."
rm -rf sessions/
mkdir -p sessions/

echo "⏳ 3. Esperando 10 segundos para limpieza completa..."
sleep 10

echo "🚀 4. Iniciando servidor fresco..."
npx tsx simple-baileys.ts &
SERVER_PID=$!

echo "⏳ 5. Esperando que el servidor arranque..."
sleep 5

# Verificar que el servidor esté corriendo
for i in {1..10}; do
    if curl -s "$API_URL/health" > /dev/null 2>&1; then
        echo "✅ Servidor corriendo!"
        break
    fi
    echo "   Intento $i/10..."
    sleep 2
done

echo -e "\n📱 6. Creando sesión fresca..."
SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"sessionName\": \"$SESSION_NAME\"}")

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
echo "✅ Sesión creada: $SESSION_ID"

echo -e "\n🔗 7. Conectando sesión..."
echo "💡 MIRA LA TERMINAL - EL QR APARECERÁ COMO ASCII ART"
echo "💡 Escanéalo INMEDIATAMENTE con WhatsApp"

curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect" | jq '.'

echo -e "\n⏳ 8. Esperando conexión (60 segundos)..."
for i in {1..12}; do
    echo "   Verificando... $i/12"
    STATUS=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq -r '.data.status')
    echo "   Estado: $STATUS"
    
    if [ "$STATUS" = "connected" ]; then
        echo -e "\n🎉 ¡ÉXITO! WhatsApp conectado"
        echo "📤 Prueba enviar mensaje:"
        echo "   ./test-send-message.sh $SESSION_ID TU_NUMERO"
        exit 0
    elif [ "$STATUS" = "error" ]; then
        echo -e "\n❌ Error detectado. El QR probablemente expiró o falló"
        echo "💡 Ejecuta el script de nuevo para un fresh start"
        exit 1
    fi
    
    sleep 5
done

echo -e "\n⏰ Tiempo agotado"
echo "Estado final: $(curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq -r '.data.status')"