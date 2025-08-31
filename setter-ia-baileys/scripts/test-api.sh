#!/bin/bash

# Setter IA Baileys - API Testing Script

API_URL="http://localhost:3001"
API_KEY="test-api-key-12345"

echo "🧪 Testing Setter IA Baileys API"
echo "================================"

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
curl -s -w "Status: %{http_code}\n" "$API_URL/health" | jq . 2>/dev/null || echo "Response received"
echo ""

# Test 2: Get Sessions (should be empty initially)
echo "2️⃣  Testing Get Sessions..."
curl -s -H "X-API-Key: $API_KEY" "$API_URL/api/v1/sessions" | jq . 2>/dev/null || echo "Response received"
echo ""

# Test 3: Create Session
echo "3️⃣  Testing Create Session..."
SESSION_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"sessionName": "test-session-api"}' \
  "$API_URL/api/v1/sessions")

echo "$SESSION_RESPONSE" | jq . 2>/dev/null || echo "Response received"

# Extract session ID
SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id' 2>/dev/null)

if [ "$SESSION_ID" != "null" ] && [ "$SESSION_ID" != "" ]; then
    echo "✅ Session created with ID: $SESSION_ID"
    
    # Test 4: Get Session Status
    echo ""
    echo "4️⃣  Testing Get Session Status..."
    curl -s -H "X-API-Key: $API_KEY" "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq . 2>/dev/null || echo "Response received"
    echo ""
    
    # Test 5: Connect Session
    echo "5️⃣  Testing Connect Session..."
    curl -s -X POST -H "X-API-Key: $API_KEY" "$API_URL/api/v1/sessions/$SESSION_ID/connect" | jq . 2>/dev/null || echo "Response received"
    echo ""
    
    # Test 6: Get QR Code
    echo "6️⃣  Testing Get QR Code..."
    QR_RESPONSE=$(curl -s -H "X-API-Key: $API_KEY" "$API_URL/api/v1/sessions/$SESSION_ID/qr")
    echo "$QR_RESPONSE" | jq . 2>/dev/null || echo "Response received"
    echo ""
    
    # Test 7: Try to send message (will fail without connection)
    echo "7️⃣  Testing Send Message (will fail - session not connected)..."
    curl -s -X POST \
      -H "Content-Type: application/json" \
      -H "X-API-Key: $API_KEY" \
      -d '{"to": "1234567890", "type": "text", "content": {"text": "Test message"}}' \
      "$API_URL/api/v1/sessions/$SESSION_ID/send-message" | jq . 2>/dev/null || echo "Response received"
    echo ""
    
    # Clean up - Delete session
    echo "8️⃣  Cleaning up - Delete Session..."
    curl -s -X DELETE -H "X-API-Key: $API_KEY" "$API_URL/api/v1/sessions/$SESSION_ID" | jq . 2>/dev/null || echo "Response received"
    echo ""
    
else
    echo "❌ Failed to create session"
fi

echo "✅ API Testing completed!"
echo ""
echo "💡 Para una prueba completa:"
echo "   1. Inicia los servicios: ./scripts/start-dev.sh"
echo "   2. Abre test/whatsapp-test.html en tu navegador"
echo "   3. Crea una sesión y escanea el código QR"
echo "   4. Envía un mensaje de prueba"