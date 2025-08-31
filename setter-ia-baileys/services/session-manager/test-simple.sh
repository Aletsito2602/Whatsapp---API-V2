#!/bin/bash

echo "🚀 SIMPLE BAILEYS TEST (Using working server)"
echo "=============================================="

API_URL="http://localhost:3001"
YOUR_PHONE="+17862537273"

# Kill any existing processes
echo "🧹 1. Cleaning up..."
pkill -f "simple-baileys" 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
rm -rf sessions/ 2>/dev/null || true
mkdir -p sessions

echo "⏳ 2. Waiting for cleanup..."
sleep 3

echo "🚀 3. Starting simple-baileys server..."
npx tsx simple-baileys.ts &
SERVER_PID=$!
echo "   Server PID: $SERVER_PID"

echo "⏳ 4. Waiting for server startup..."
sleep 5

# Test health
echo -e "\n📡 5. Testing server health..."
HEALTH=$(curl -s "$API_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ Server is healthy"
    echo "$HEALTH" | jq '.'
else
    echo "❌ Server not responding, trying again..."
    sleep 3
    HEALTH=$(curl -s "$API_URL/health" 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "❌ Server still not responding"
        kill $SERVER_PID 2>/dev/null
        exit 1
    fi
fi

echo -e "\n🧹 6. System reset..."
curl -s -X POST "$API_URL/api/v1/system/reset" | jq '.'

echo -e "\n📱 7. Choose test method:"
echo "   1) QR Code (scan with phone)"
echo "   2) Pairing Code (enter code in WhatsApp)"
read -p "Select option (1 or 2): " CHOICE

if [ "$CHOICE" = "2" ]; then
    echo -e "\n📱 Creating session with PAIRING CODE..."
    SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"sessionName\": \"pairing$(date +%s)\", \"phoneNumber\": \"$YOUR_PHONE\"}")
else
    echo -e "\n📱 Creating session for QR CODE..."
    SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"sessionName\": \"qr$(date +%s)\"}")
fi

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
echo "✅ Session created: $SESSION_ID"

echo -e "\n🔗 8. Connecting session..."
if [ "$CHOICE" = "2" ]; then
    echo "💡 THE PAIRING CODE WILL APPEAR IN THE SERVER TERMINAL"
else
    echo "💡 THE QR CODE WILL APPEAR IN THE SERVER TERMINAL"
fi

CONNECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect")
echo "$CONNECT_RESPONSE" | jq '.'

echo -e "\n📱 IMPORTANT: Look at the server terminal for authentication!"
echo "=================================================="

if [ "$CHOICE" = "2" ]; then
    echo "🔢 PAIRING CODE should appear above"
    echo "📱 In WhatsApp:"
    echo "   Settings > Linked Devices > Link a Device > Link with Phone Number"
else
    echo "📱 QR CODE should appear above as ASCII art"
    echo "📱 In WhatsApp:"
    echo "   Settings > Linked Devices > Link a Device > Scan QR"
fi

echo -e "\n⏳ 9. Monitoring connection for 60 seconds..."
for i in {1..12}; do
    echo "   Checking... $i/12"
    STATUS=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq -r '.data.status' 2>/dev/null)
    echo "   Status: $STATUS"
    
    if [ "$STATUS" = "connected" ]; then
        echo -e "\n🎉 SUCCESS! WhatsApp connected!"
        echo "📊 Session info:"
        curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq '.data'
        
        echo -e "\n📤 Send test message? (y/n)"
        read -p "Send message: " SEND_MSG
        
        if [ "$SEND_MSG" = "y" ]; then
            read -p "Destination number (digits only): " DEST
            
            curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/send-message" \
              -H "Content-Type: application/json" \
              -d "{\"to\": \"$DEST\", \"type\": \"text\", \"content\": {\"text\": \"Hello from Baileys! 🚀\"}}" | jq '.'
        fi
        
        kill $SERVER_PID 2>/dev/null
        exit 0
    elif [ "$STATUS" = "error" ]; then
        echo -e "\n❌ Connection failed"
        break
    fi
    
    sleep 5
done

echo -e "\n⏰ Connection timeout"
curl -s "$API_URL/api/v1/sessions/$SESSION_ID/status" | jq '.data' 2>/dev/null

kill $SERVER_PID 2>/dev/null