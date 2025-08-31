#!/bin/bash

echo "🏛️ BAILEYS OFFICIAL DOCUMENTATION COMPLIANT TEST"
echo "================================================="

API_URL="http://localhost:3001"
YOUR_PHONE="+17862537273"  # Change to your actual phone number

# Kill any existing processes
echo "🧹 1. Cleaning up existing processes..."
pkill -f "clean-baileys" 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
rm -rf sessions/

echo "⏳ 2. Waiting for cleanup..."
sleep 3

echo "🚀 3. Starting server with official implementation..."
npx tsx clean-baileys.ts &
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
    echo "❌ Server not responding"
    exit 1
fi

echo -e "\n🧹 6. System reset..."
curl -s -X POST "$API_URL/system/reset" | jq '.'

echo -e "\n📊 Which method do you want to test?"
echo "   1) QR Code (recommended for first connection)"
echo "   2) Pairing Code (requires phone number)"
read -p "Select option (1 or 2): " CHOICE

if [ "$CHOICE" = "2" ]; then
    # PAIRING CODE TEST
    echo -e "\n📱 Creating session with PAIRING CODE..."
    SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"sessionName\": \"pairing$(date +%s)\", \"phoneNumber\": \"$YOUR_PHONE\"}")
    
    SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
    echo "✅ Session created: $SESSION_ID"
    
    echo -e "\n🔗 Connecting with pairing code..."
    echo "💡 THE PAIRING CODE WILL APPEAR ABOVE"
    
    CONNECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect")
    echo "$CONNECT_RESPONSE" | jq '.'
    
    echo -e "\n🔢 LOOK FOR THE PAIRING CODE IN THE SERVER TERMINAL"
    echo "=================================================="
    echo "📱 Instructions:"
    echo "   1. Open WhatsApp on your phone"
    echo "   2. Settings > Linked Devices"
    echo "   3. Link a Device"
    echo "   4. Link with Phone Number Instead"
    echo "   5. Enter the code shown in the server terminal"
    
else
    # QR CODE TEST
    echo -e "\n📱 Creating session for QR CODE..."
    SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions" \
      -H "Content-Type: application/json" \
      -d "{\"sessionName\": \"qr$(date +%s)\"}")
    
    SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.id')
    echo "✅ Session created: $SESSION_ID"
    
    echo -e "\n🔗 Connecting with QR code..."
    echo "💡 THE QR CODE WILL APPEAR ABOVE"
    
    CONNECT_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/connect")
    echo "$CONNECT_RESPONSE" | jq '.'
    
    echo -e "\n📱 LOOK FOR THE QR CODE IN THE SERVER TERMINAL"
    echo "=============================================="
    echo "📱 Instructions:"
    echo "   1. Open WhatsApp on your phone"
    echo "   2. Settings > Linked Devices"
    echo "   3. Link a Device"
    echo "   4. Scan the QR code shown above"
fi

echo -e "\n⏳ Monitoring connection for 60 seconds..."
for i in {1..12}; do
    echo "   Checking status... $i/12"
    
    STATUS_RESPONSE=$(curl -s "$API_URL/api/v1/sessions/$SESSION_ID" 2>/dev/null)
    if [ $? -eq 0 ]; then
        STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.status')
        echo "   Status: $STATUS"
        
        case $STATUS in
            "connected")
                echo -e "\n🎉 SUCCESS! WhatsApp connected successfully!"
                echo "📊 Final session info:"
                echo "$STATUS_RESPONSE" | jq '.data'
                
                echo -e "\n📤 Test message? (y/n)"
                read -p "Send test message: " SEND_MSG
                
                if [ "$SEND_MSG" = "y" ] || [ "$SEND_MSG" = "Y" ]; then
                    read -p "Enter destination number (digits only): " DEST_NUMBER
                    
                    MESSAGE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/sessions/$SESSION_ID/send-message" \
                      -H "Content-Type: application/json" \
                      -d "{
                        \"to\": \"$DEST_NUMBER\", 
                        \"type\": \"text\", 
                        \"content\": {
                          \"text\": \"🚀 Hello from Clean Baileys!\n\n✅ Official documentation compliant implementation\n⏰ Sent at $(date)\"
                        }
                      }")
                    
                    echo "📤 Message result:"
                    echo "$MESSAGE_RESPONSE" | jq '.'
                fi
                
                kill $SERVER_PID 2>/dev/null
                exit 0
                ;;
            "error")
                echo -e "\n❌ Connection failed with error"
                break
                ;;
        esac
    else
        echo "   ⚠️ API not responding"
    fi
    
    sleep 5
done

echo -e "\n⏰ Connection timeout or failed"
echo "📊 Final status:"
curl -s "$API_URL/api/v1/sessions/$SESSION_ID" | jq '.data' 2>/dev/null || echo "API not responding"

echo -e "\n🛑 Cleaning up..."
kill $SERVER_PID 2>/dev/null

echo -e "\n💡 Tips for troubleshooting:"
echo "   - Make sure no other WhatsApp Web sessions are active"
echo "   - Wait a few minutes between connection attempts"
echo "   - Check that your phone has internet connection"
echo "   - Ensure WhatsApp is up to date on your phone"