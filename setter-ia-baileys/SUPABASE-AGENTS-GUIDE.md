# 🤖 Guía de Integración Supabase - Sistema de Agentes

## 📋 Configuración Inicial

### 1. Configurar Supabase

#### Crear proyecto en Supabase:
1. Ve a [https://supabase.com](https://supabase.com)
2. Crea un nuevo proyecto
3. Copia tu `Project URL` y `anon public key`

#### Variables de entorno:
```bash
# .env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 2. Crear tabla de agentes

Ejecuta este SQL en el **SQL Editor** de Supabase:

```sql
-- Ejecutar el contenido de supabase-schema.sql
```

### 3. Instalar dependencia
```bash
npm install @supabase/supabase-js
```

---

## 🏗️ Arquitectura del Sistema

### Flujo de Funcionamiento:

1. **Usuario conecta WhatsApp** → Genera sesión
2. **Admin crea agente** → Define `trigger` + `prompt` en Supabase
3. **WhatsApp recibe mensaje** → Busca triggers activos
4. **Detecta trigger** → Usa prompt específico del agente
5. **Gemini responde** → Con personalidad del agente
6. **Actualiza estadísticas** → Contador de activaciones

---

## 🎯 Endpoints de Agentes

### 📝 Crear Agente
```bash
POST /api/v1/agents
X-API-Key: sk-setter-2024-prod-key-12345
Content-Type: application/json

{
  "nombre": "Bot de Soporte",
  "descripcion": "Especializado en atención al cliente",
  "action_trigger": "soporte",
  "prompt": "Eres un experto en soporte técnico. Responde profesionalmente y ayuda a resolver problemas. Siempre pregunta si necesitan más ayuda. 🛠️",
  "session_id": "opcional-para-sesion-especifica",
  "user_id": "usuario123",
  "config": {
    "maxResponseLength": 500,
    "language": "es"
  }
}
```

### 📋 Listar Agentes
```bash
# Todos los agentes
GET /api/v1/agents

# Filtrar por sesión
GET /api/v1/agents?session_id=12345

# Filtrar por usuario
GET /api/v1/agents?user_id=usuario123

# Incluir inactivos
GET /api/v1/agents?is_active=all
```

### 🔍 Buscar por Trigger
```bash
GET /api/v1/agents/by-trigger/soporte?session_id=12345&user_id=usuario123
```

### ✏️ Actualizar Agente
```bash
PUT /api/v1/agents/{id}
Content-Type: application/json

{
  "nombre": "Bot de Soporte Pro",
  "prompt": "Eres un experto senior en soporte técnico...",
  "is_active": true
}
```

### 🗑️ Eliminar Agente
```bash
DELETE /api/v1/agents/{id}
```

### 📊 Estadísticas
```bash
GET /api/v1/agents-stats
```

---

## 🤖 Casos de Uso

### 1. **Agente de Soporte**
```javascript
// Crear agente de soporte
const soporteAgent = {
  nombre: "Asistente de Soporte",
  action_trigger: "soporte",
  prompt: `Eres un especialista en soporte técnico profesional.
  
  Características:
  - Responde con empatía y profesionalismo
  - Pregunta detalles específicos del problema
  - Ofrece soluciones paso a paso
  - Escalas casos complejos cuando es necesario
  - Terminas con 🛠️
  
  Estilo: Formal pero amigable`
};
```

**Activación:** Usuario escribe "tengo un problema con soporte"
**Respuesta:** Agente especializado en soporte técnico

### 2. **Agente de Ventas**
```javascript
const ventasAgent = {
  nombre: "Consultor de Ventas",
  action_trigger: "comprar",
  prompt: `Eres un consultor de ventas experto.
  
  Objetivos:
  - Identifica necesidades del cliente
  - Presenta beneficios específicos
  - Maneja objeciones profesionalmente
  - Guía hacia la compra
  - Terminas con 💰
  
  Estilo: Persuasivo pero consultivo`
};
```

**Activación:** Usuario escribe "quiero comprar algo"
**Respuesta:** Agente enfocado en convertir la venta

### 3. **Agente Específico por Sesión**
```javascript
// Para cliente específico
const clienteEspecialAgent = {
  nombre: "Agente VIP Cliente Premium",
  action_trigger: "vip",
  session_id: "session-cliente-premium-123",
  prompt: `Eres el asistente personal exclusivo para clientes Premium.
  
  - Acceso prioritario a servicios
  - Respuestas personalizadas
  - Escalamiento inmediato
  - Atención 24/7
  - Terminas con 👑`
};
```

---

## 🔄 Flujo Completo de Ejemplo

### 1. Configurar el Sistema
```bash
# Configurar variables de entorno
export SUPABASE_URL="https://abc123.supabase.co"
export SUPABASE_ANON_KEY="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."

# Iniciar servidor
npm start
```

### 2. Crear Agentes
```bash
# Crear agente de soporte
curl -X POST "http://localhost:3001/api/v1/agents" \
  -H "X-API-Key: sk-setter-2024-prod-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Bot de Soporte",
    "action_trigger": "soporte",
    "prompt": "Eres un experto en soporte técnico. Ayuda a resolver problemas de manera profesional. 🛠️",
    "user_id": "empresa123"
  }'

# Crear agente de ventas
curl -X POST "http://localhost:3001/api/v1/agents" \
  -H "X-API-Key: sk-setter-2024-prod-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Consultor de Ventas",
    "action_trigger": "comprar",
    "prompt": "Eres un consultor de ventas experto. Ayuda a los clientes a encontrar la mejor solución. 💰",
    "user_id": "empresa123"
  }'
```

### 3. Conectar WhatsApp
```bash
# Crear sesión
curl -X POST "http://localhost:3001/api/v1/sessions" \
  -H "X-API-Key: sk-setter-2024-prod-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"sessionName": "empresa123_bot"}'

# Conectar (ver QR en terminal)
curl -X POST "http://localhost:3001/api/v1/sessions/SESION_ID/connect" \
  -H "X-API-Key: sk-setter-2024-prod-key-12345"
```

### 4. ¡Sistema Activo!

**Cliente envía:** "Hola, necesito soporte con mi pedido"
**Sistema:** 
1. Detecta palabra "soporte"
2. Encuentra agente de soporte en Supabase
3. Usa prompt específico del agente
4. Gemini responde como especialista en soporte
5. Incrementa contador de activaciones

**Cliente envía:** "Quiero comprar el plan premium"
**Sistema:**
1. Detecta palabra "comprar"  
2. Encuentra agente de ventas
3. Responde como consultor de ventas especializado

---

## 📊 Prioridad de Agentes

El sistema busca agentes en este orden:

1. **Sesión específica:** `session_id` = sesión actual
2. **Usuario específico:** `user_id` sin `session_id`
3. **Global:** Sin `session_id` ni `user_id`
4. **Fallback:** Configuración global del sistema

---

## 🔧 Configuración Avanzada

### Multi-tenant por Usuario
```javascript
// Cada empresa puede tener sus propios agentes
const agent = {
  nombre: "Bot Empresa A",
  action_trigger: "ayuda",
  user_id: "empresa_a", // Aislamiento por empresa
  prompt: "Responde según las políticas de la Empresa A..."
};
```

### Agentes Especializados por Sesión
```javascript
// Cliente VIP con agente personal
const vipAgent = {
  nombre: "Asistente Personal VIP",
  action_trigger: "asistente",
  session_id: "session_cliente_vip_001",
  prompt: "Eres el asistente personal exclusivo del cliente VIP..."
};
```

### Configuración Dinámica
```javascript
const config = {
  maxResponseLength: 500,
  language: "es",
  escalationKeywords: ["gerente", "supervisor", "escalate"],
  businessHours: "09:00-18:00",
  timezone: "America/Argentina/Buenos_Aires"
};
```

---

## 🚀 Deployment en Producción

### 1. Variables de Entorno
```bash
# Producción
SUPABASE_URL=https://prod.supabase.co
SUPABASE_ANON_KEY=prod_key
SETTER_API_KEY=sk-setter-2024-prod-secure-key

# Base de datos
DATABASE_URL=postgresql://user:pass@host:5432/db
```

### 2. Row Level Security (RLS)
La tabla `agentes` tiene RLS habilitado:
- Usuarios solo ven sus propios agentes
- Autenticación por `user_id`
- Aislamiento completo entre tenants

### 3. Monitoreo
```bash
# Ver estadísticas
curl -H "X-API-Key: prod-key" \
     "http://tu-server/api/v1/agents-stats"

# Monitorear activaciones
curl -H "X-API-Key: prod-key" \
     "http://tu-server/api/v1/agents?user_id=empresa123"
```

---

## ✅ Checklist de Implementación

- [ ] ✅ Supabase configurado
- [ ] ✅ Tabla `agentes` creada
- [ ] ✅ Variables de entorno configuradas
- [ ] ✅ API Keys de seguridad activas
- [ ] ✅ Primer agente creado y testeado
- [ ] ✅ WhatsApp conectado y respondiendo
- [ ] ✅ Estadísticas funcionando
- [ ] ✅ Multi-tenant configurado (si aplica)

¡Tu sistema de agentes inteligentes con Supabase está listo! 🎉