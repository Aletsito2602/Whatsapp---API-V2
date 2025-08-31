# 📚 Setter IA Baileys - API Documentation

## 🔐 Autenticación

Todas las rutas de API requieren autenticación con API Key:

```bash
# Opción 1: Header X-API-Key
curl -H "X-API-Key: sk-setter-2024-prod-key-12345" \
     -H "Content-Type: application/json" \
     "http://localhost:3001/api/v1/sessions"

# Opción 2: Authorization Bearer
curl -H "Authorization: Bearer sk-setter-2024-prod-key-12345" \
     -H "Content-Type: application/json" \
     "http://localhost:3001/api/v1/sessions"
```

**API Keys disponibles:**
- `sk-setter-2024-prod-key-12345` (Producción)
- `sk-setter-2024-dev-key-67890` (Desarrollo)
- `test-api-key-12345` (Testing)

## 🚦 Rate Limiting

- **Límite:** 100 requests por minuto por API key
- **Respuesta 429:** Si excedes el límite

---

## 📱 Gestión de Sesiones

### Crear Sesión
```bash
POST /api/v1/sessions
Content-Type: application/json

{
  "sessionName": "cliente_empresa_A",
  "phoneNumber": "+5491234567890"  // Opcional: para pairing code
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "1693456789000-abc123def",
    "userId": "test-user-id",
    "sessionName": "cliente_empresa_A",
    "phoneNumber": "+5491234567890",
    "status": "disconnected",
    "createdAt": "2024-08-31T05:00:00.000Z"
  }
}
```

### Listar Sesiones
```bash
GET /api/v1/sessions
```

### Obtener Estado de Sesión
```bash
GET /api/v1/sessions/{sessionId}/status
```

### Conectar Sesión
```bash
POST /api/v1/sessions/{sessionId}/connect
```

⚠️ **Importante:** Después de conectar, revisa la **terminal del servidor** para ver el QR code o pairing code.

### Obtener QR Code
```bash
GET /api/v1/sessions/{sessionId}/qr
```

### Obtener Pairing Code
```bash
GET /api/v1/sessions/{sessionId}/pairing-code
```

---

## 💬 Envío de Mensajes

### Mensaje de Texto
```bash
POST /api/v1/sessions/{sessionId}/send-message
Content-Type: application/json

{
  "to": "5491234567890",
  "type": "text",
  "content": {
    "text": "¡Hola! Este es un mensaje desde la API 🚀"
  }
}
```

### Mensaje con Imagen (URL)
```bash
POST /api/v1/sessions/{sessionId}/send-message
Content-Type: application/json

{
  "to": "5491234567890",
  "type": "image",
  "content": {
    "url": "https://example.com/image.jpg",
    "caption": "Mira esta imagen!"
  }
}
```

### Mensaje con Imagen (Base64)
```bash
POST /api/v1/sessions/{sessionId}/send-message
Content-Type: application/json

{
  "to": "5491234567890",
  "type": "image",
  "content": {
    "buffer": "iVBORw0KGgoAAAANSUhEUgAA...", // Base64
    "caption": "Imagen desde buffer"
  }
}
```

### Mensaje de Audio
```bash
POST /api/v1/sessions/{sessionId}/send-message
Content-Type: application/json

{
  "to": "5491234567890",
  "type": "audio",
  "content": {
    "url": "https://example.com/audio.mp3"
  }
}
```

### Documento
```bash
POST /api/v1/sessions/{sessionId}/send-message
Content-Type: application/json

{
  "to": "5491234567890",
  "type": "document",
  "content": {
    "url": "https://example.com/document.pdf",
    "fileName": "documento.pdf",
    "mimetype": "application/pdf"
  }
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "messageId": "3A1234567890@s.whatsapp.net_ABCDEF123456",
    "status": "sent",
    "timestamp": "2024-08-31T05:00:00.000Z"
  }
}
```

---

## 📨 Recepción de Mensajes

### Obtener Mensajes Recibidos
```bash
GET /api/v1/sessions/{sessionId}/messages?limit=50&offset=0
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "sessionId": "1693456789000-abc123def",
    "messages": [
      {
        "id": "3A1234567890@s.whatsapp.net_ABCDEF123456",
        "from": "5491234567890@s.whatsapp.net",
        "fromName": "Juan Pérez",
        "type": "text",
        "text": "Hola, necesito ayuda con setter",
        "mediaData": null,
        "timestamp": "2024-08-31T05:00:00.000Z",
        "sessionId": "1693456789000-abc123def"
      },
      {
        "id": "3A1234567890@s.whatsapp.net_FEDCBA654321",
        "from": "5491234567890@s.whatsapp.net",
        "fromName": "Juan Pérez",
        "type": "image",
        "text": "Mira esta foto",
        "mediaData": {
          "mimetype": "image/jpeg",
          "fileLength": "245760",
          "width": 1280,
          "height": 720
        },
        "timestamp": "2024-08-31T05:01:00.000Z",
        "sessionId": "1693456789000-abc123def"
      }
    ],
    "total": 25,
    "limit": 50,
    "offset": 0
  }
}
```

### Descargar Media
```bash
GET /api/v1/sessions/{sessionId}/messages/{messageId}/media
```

---

## 🤖 Auto-Respuesta con Gemini AI

### Configurar Auto-Respuesta
```bash
POST /api/v1/auto-response/config
Content-Type: application/json

{
  "enabled": true,
  "triggerWord": "bot",
  "prompt": "Eres un asistente virtual llamado Setter. Responde de manera útil y amigable en español. Mantén tus respuestas concisas pero informativas. Siempre termina con un emoji relacionado al tema."
}
```

### Obtener Configuración
```bash
GET /api/v1/auto-response/config
```

### Test Gemini
```bash
POST /api/v1/auto-response/test
Content-Type: application/json

{
  "message": "Hola bot, ¿cómo estás?"
}
```

---

## 📊 Estadísticas y Monitoreo

### Health Check (Público)
```bash
GET /health
```

### Estadísticas Detalladas
```bash
GET /api/v1/stats
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "totalSessions": 3,
    "connectedSessions": 2,
    "totalMessages": 150,
    "sessionStats": {
      "1693456789000-abc123def": {
        "status": "connected",
        "messageCount": 45,
        "lastActivity": "2024-08-31T05:15:00.000Z"
      }
    }
  }
}
```

---

## 🧹 Mantenimiento

### Limpiar Todas las Sesiones
```bash
POST /api/v1/sessions/cleanup
```

### Reset Completo del Sistema
```bash
POST /api/v1/system/reset
```

### Eliminar Sesión Específica
```bash
DELETE /api/v1/sessions/{sessionId}
```

---

## 🔧 Webhook (Opcional)

### Configurar Webhook para Mensajes
```bash
POST /api/v1/webhook
Content-Type: application/json

{
  "sessionId": "1693456789000-abc123def",
  "messageType": "text",
  "from": "5491234567890",
  "text": "Mensaje recibido",
  "timestamp": "2024-08-31T05:00:00.000Z"
}
```

---

## 📝 Tipos de Media Soportados

### Imágenes
- **Formatos:** JPG, PNG, GIF, WebP
- **Tamaño máximo:** 16MB
- **Envío:** URL o Base64 buffer

### Audio
- **Formatos:** MP3, AAC, OGG, M4A
- **Tamaño máximo:** 16MB
- **Envío:** URL o Base64 buffer

### Documentos
- **Formatos:** PDF, DOC, DOCX, XLS, XLSX, TXT, etc.
- **Tamaño máximo:** 100MB
- **Envío:** URL o Base64 buffer

---

## ⚠️ Consideraciones de Producción

### Seguridad
- ✅ API Key obligatorio
- ✅ Rate limiting
- ✅ Validación de entrada
- ✅ Logs de auditoría

### Escalabilidad  
- ✅ Múltiples sesiones simultáneas
- ✅ Session managers independientes
- ✅ Configuración optimizada para producción
- ⚠️ En producción real usar base de datos para mensajes

### Monitoreo
- ✅ Logs detallados por sesión
- ✅ Estadísticas en tiempo real  
- ✅ Health checks
- ✅ Tracking de actividad por sesión

### Limitaciones de WhatsApp
- ⚠️ Máximo 4 dispositivos conectados por número
- ⚠️ WhatsApp puede bloquear por uso excesivo
- ⚠️ No usar para spam o mensajes masivos no deseados

---

## 🚀 Ejemplo Completo de Integración

```javascript
class SetterWhatsAppClient {
  constructor(apiKey, baseUrl = 'http://localhost:3001') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async createSession(sessionName, phoneNumber = null) {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionName, phoneNumber })
    });
    return await response.json();
  }

  async connectSession(sessionId) {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/connect`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey }
    });
    return await response.json();
  }

  async sendMessage(sessionId, to, type, content) {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/send-message`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, type, content })
    });
    return await response.json();
  }

  async getMessages(sessionId, limit = 50, offset = 0) {
    const response = await fetch(`${this.baseUrl}/api/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`, {
      headers: { 'X-API-Key': this.apiKey }
    });
    return await response.json();
  }
}

// Uso
const client = new SetterWhatsAppClient('sk-setter-2024-prod-key-12345');

// Crear y conectar sesión
const session = await client.createSession('mi_cliente_1', '+5491234567890');
await client.connectSession(session.data.id);

// Enviar mensaje
await client.sendMessage(session.data.id, '5491234567890', 'text', {
  text: '¡Hola desde la API!'
});

// Ver mensajes recibidos
const messages = await client.getMessages(session.data.id);
console.log(messages.data.messages);
```