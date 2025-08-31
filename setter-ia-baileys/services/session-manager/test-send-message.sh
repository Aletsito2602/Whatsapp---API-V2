#!/bin/bash

# Script para probar envío de mensajes
if [ $# -eq 0 ]; then
    echo "❌ Uso: $0 <SESSION_ID> [NUMERO_DESTINO]"
    echo "   Ejemplo: $0 abc123... 5491234567890"
    exit 1
fi

SESSION_ID="$1"
RECIPIENT="${2:-5491234567890}"  # Número por defecto o el que pases
API_URL="http://localhost:3001"

echo "📤 Testing envío de mensaje"
echo "=========================="
echo "   📋 Sesión: $SESSION_ID"
echo "   📞 Destino: $RECIPIENT"

echo -e "\n📊 1. Verificando estado de sesión..."
STATUS_RESPONSE=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status")
echo "$STATUS_RESPONSE" | jq '.'

SESSION_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')

if [ "$SESSION_STATUS" != "connected" ]; then
    echo "❌ Error: Sesión no conectada (estado: $SESSION_STATUS)"
    echo "💡 Primero conecta la sesión con el script test-api.sh"
    exit 1
fi

echo -e "\n📤 2. Enviando mensaje de prueba..."
MESSAGE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/send-message" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"$RECIPIENT\", 
    \"type\": \"text\", 
    \"content\": {
      \"text\": \"🚀 ¡Hola! Este es un mensaje de prueba desde Setter IA Baileys.\n\n✅ El sistema funciona correctamente!\n\n⏰ Enviado: $(date)\"
    }
  }")

echo "$MESSAGE_RESPONSE" | jq '.'

MESSAGE_ID=$(echo "$MESSAGE_RESPONSE" | jq -r '.data.messageId // empty')

if [ -n "$MESSAGE_ID" ]; then
    echo -e "\n✅ ¡MENSAJE ENVIADO EXITOSAMENTE!"
    echo "   📧 ID del mensaje: $MESSAGE_ID"
    echo "   📱 Revisa WhatsApp en el número +$RECIPIENT"
else
    echo -e "\n❌ Error al enviar mensaje"
    echo "$MESSAGE_RESPONSE" | jq '.error'
fi