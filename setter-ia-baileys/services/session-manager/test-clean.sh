#!/bin/bash

echo "🧹 CLEAN BAILEYS TESTING"
echo "========================"

API_URL="http://localhost:3001"
YOUR_PHONE="+17862537273"  # Tu número

echo "🚀 1. Starting clean server..."
npx tsx clean-baileys.ts &
SERVER_PID=$!

echo "⏳ 2. Waiting for server to start..."
sleep 5

echo "📡 3. Testing health..."
curl -s "$API_URL/health" | jq '.'

echo -e "\n🧹 4. System reset..."
curl -s -X POST "$API_URL/system/reset" | jq '.'

echo -e "\n📱 5. Creating session for PAIRING CODE..."
SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"sessionName\": \"clean$(date +%s)\", \"phoneNumber\": \"$YOUR_PHONE\"}")

SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
echo "✅ Session created: $SESSION_ID"

echo -e "\n🔗 6. Connecting session..."
echo "💡 THE PAIRING CODE WILL APPEAR IN THE SERVER TERMINAL"
echo "💡 Check the terminal where 'npx tsx clean-baileys.ts' is running"

curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect" | jq '.'

echo -e "\n⏳ 7. Waiting for connection (60 seconds)..."
for i in {1..12}; do
    echo "   Checking... $i/12"
    STATUS=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID" | jq -r '.data.status')
    echo "   Status: $STATUS"
    
    if [ "$STATUS" = "connected" ]; then
        echo -e "\n🎉 SUCCESS! WhatsApp connected"
        echo "📤 Test message:"
        echo "   curl -X POST $API_URL/api/v1/sessions/$SESSION_ID/send-message \\"
        echo "     -H 'Content-Type: application/json' \\"
        echo "     -d '{\"to\": \"YOUR_NUMBER\", \"type\": \"text\", \"content\": {\"text\": \"Hello from Clean Baileys!\"}}'"
        kill $SERVER_PID 2>/dev/null
        exit 0
    elif [ "$STATUS" = "error" ]; then
        echo -e "\n❌ Connection failed"
        break
    fi
    
    sleep 5
done

echo -e "\n⏰ Timeout or error"
curl -s "$API_URL/api/v1/sessions/$SESSION_ID" | jq '.data'

kill $SERVER_PID 2>/dev/null