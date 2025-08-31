#!/bin/bash

# Script de testing directo para la API de Baileys
echo "🚀 Testing Setter IA Baileys API"
echo "================================"

API_URL="http://localhost:3001"
PHONE_NUMBER="+17862537273"  # Cambia por tu número
SESSION_NAME="test$(date +%s)"

echo "📡 1. Testing health check..."
curl -s "$API_URL/health" | jq '.'

echo -e "\n🧹 2. Limpiando sistema..."
curl -s -X POST "$API_URL/api/v1/system/reset" | jq '.data.message'

echo -e "\n📱 3. Creando sesión para QR CODE..."
echo "   Sesión: $SESSION_NAME (sin número para QR)"

SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"sessionName\": \"$SESSION_NAME\"}")

echo "$SESSION_RESPONSE" | jq '.'

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
echo "   📋 Session ID: $SESSION_ID"

if [ "$SESSION_ID" = "null" ]; then
    echo "❌ Error: No se pudo crear la sesión"
    exit 1
fi

echo -e "\n🔗 4. Conectando sesión..."
CONNECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect")
echo "$CONNECT_RESPONSE" | jq '.'

# Verificar si hay código de emparejamiento en la respuesta
PAIRING_CODE=$(echo "$CONNECT_RESPONSE" | jq -r '.data.code // empty')

if [ -n "$PAIRING_CODE" ]; then
    echo -e "\n🔢 ¡CÓDIGO DE EMPAREJAMIENTO GENERADO!"
    echo "======================================"
    echo "   📱 Código: $PAIRING_CODE"
    echo "   📞 Número: $PHONE_NUMBER"
    echo "======================================"
    echo ""
    echo "📱 Para vincular en WhatsApp:"
    echo "   1. Abre WhatsApp en tu teléfono"
    echo "   2. Ve a Configuración > Dispositivos vinculados"
    echo "   3. Toca 'Vincular un dispositivo'"
    echo "   4. Toca 'Vincular con número de teléfono'"
    echo "   5. Ingresa este código: $PAIRING_CODE"
else
    echo -e "\n📱 5. Esperando QR code..."
    for i in {1..10}; do
        echo "   Intento $i/10..."
        QR_RESPONSE=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID/qr")
        
        if echo "$QR_RESPONSE" | jq -e '.success' > /dev/null; then
            echo "✅ QR Code disponible!"
            echo "$QR_RESPONSE" | jq '.data.qrCode' -r | sed 's/data:image\/png;base64,//' | base64 -d > qr-code.png
            echo "📱 QR guardado en: qr-code.png"
            echo "   Abre el archivo y escanéalo con WhatsApp"
            break
        fi
        
        sleep 2
    done
fi

echo -e "\n📊 6. Estado final de la sesión:"
curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq '.'

echo -e "\n✅ Testing completado!"
echo "💡 Si obtuviste un código, vincúlalo en WhatsApp y luego usa:"
echo "   ./test-send-message.sh $SESSION_ID"