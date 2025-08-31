import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrTerminal from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const app = express();
const port = 3001;

// Middleware - CORS configurado para permitir archivos locales
app.use(cors({
  origin: true, // Permitir cualquier origen (incluyendo file://)
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'x-api-key']
}));
app.use(express.json());

// SEGURIDAD: API Key Authentication
const API_KEYS = new Set([
  'sk-setter-2024-prod-key-12345',
  'sk-setter-2024-dev-key-67890',
  process.env.SETTER_API_KEY || 'test-api-key-12345'
]);

// Middleware de autenticación
function authenticateAPIKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key required. Use X-API-Key header or Authorization: Bearer <key>',
        timestamp: new Date()
      }
    });
  }

  if (!API_KEYS.has(apiKey)) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
        timestamp: new Date()
      }
    });
  }

  // Log del uso de API
  console.log(`🔑 API request from key: ${apiKey.substring(0, 15)}... at ${new Date().toISOString()}`);
  req.apiKey = apiKey;
  next();
}

// Rate limiting simple (en producción usar redis)
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const clientId = req.apiKey || req.ip;
  const now = Date.now();
  const windowMs = 60000; // 1 minuto
  const maxRequests = 100; // 100 requests por minuto

  if (!rateLimitMap.has(clientId)) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + windowMs });
  } else {
    const clientData = rateLimitMap.get(clientId);
    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
    } else {
      clientData.count++;
    }

    if (clientData.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Limit: ${maxRequests} per minute`,
          timestamp: new Date()
        }
      });
    }
  }

  next();
}

// Storage para sesiones - SIGUIENDO MEJORES PRÁCTICAS PARA PRODUCCIÓN
const sessions = new Map(); // sessionId -> session data
const sockets = new Map();  // sessionId -> socket instance
const pairingCodes = new Map(); // sessionId -> pairing code data
const sessionManagers = new Map(); // sessionId -> session manager
const messageHistory = new Map(); // sessionId -> messages array (en producción usar DB)

// Session Manager Class - SINGLETON PATTERN para cada sesión
class SessionManager {
  constructor(sessionId, config = {}) {
    this.sessionId = sessionId;
    this.socket = null;
    this.state = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
    this.reconnectInterval = config.reconnectInterval || 5000;
    this.autoReconnect = config.autoReconnect !== false;
    this.lastActivity = new Date();
    this.messageQueue = []; // Cola de mensajes pendientes
  }

  updateActivity() {
    this.lastActivity = new Date();
  }

  isActive() {
    return this.socket && sessions.get(this.sessionId)?.status === 'connected';
  }

  // Cleanup method para liberar recursos
  cleanup() {
    try {
      if (this.socket) {
        this.socket.end();
        this.socket = null;
      }
      this.messageQueue = [];
      this.isConnecting = false;
    } catch (error) {
      console.warn(`⚠️ Error durante cleanup de sesión ${this.sessionId}:`, error.message);
    }
  }
}

// Factory para crear Session Managers
function getOrCreateSessionManager(sessionId, config = {}) {
  if (!sessionManagers.has(sessionId)) {
    sessionManagers.set(sessionId, new SessionManager(sessionId, config));
    console.log(`🏭 Session Manager creado para ${sessionId}`);
  }
  return sessionManagers.get(sessionId);
}

// Configuración de Gemini AI
const GEMINI_API_KEY = 'AIzaSyAKq_7car-bCXq9sOEPKMiua5OXh3--UTY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Configuración de Supabase - TUS CREDENCIALES
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bqitfhvaejxcyvjszfom.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJxaXRmaHZhZWp4Y3l2anN6Zm9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5MzkwMzMsImV4cCI6MjA2OTUxNTAzM30.BbvZctdOB8lJwiocMnt9XwzD8FHpyz5V3Y9ERvfQACA';

// Cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🗄️ Supabase configurado:', {
  url: SUPABASE_URL.substring(0, 30) + '...',
  hasKey: !!SUPABASE_ANON_KEY
});

// Configuración de auto-respuesta (se actualizará desde el frontend)
let autoResponseConfig = {
  enabled: false, // DESHABILITADO - solo usar agentes específicos de Supabase
  triggerWord: 'setter',
  prompt: 'Eres un asistente de IA llamado Setter. Responde de manera útil y amigable en español. Mantén tus respuestas concisas pero informativas. Siempre termina con un emoji relacionado al tema.'
};

// Función para obtener agente activo por trigger (adaptada a tu estructura)
async function getActiveAgentByTrigger(trigger, sessionId = null, userId = null) {
  try {
    console.log(`🔍 Buscando agente para trigger: "${trigger}", userId: ${userId}`);
    
    // Buscar en la tabla agents usando tu estructura
    let query = supabase
      .from('agents')
      .select('*')
      .eq('is_active', true);

    // Filtrar por usuario si está disponible (solo si es UUID válido)
    if (userId && userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      query = query.eq('user_id', userId);
    }
    // Si userId no es válido o no existe, buscar agentes sin user_id (globales)

    const { data: agents, error } = await query;

    if (error) {
      console.error('Error query agents:', error);
      return null;
    }

    console.log(`📋 Found ${agents?.length || 0} active agents`);

    // Buscar agente que tenga el trigger en su config
    for (const agent of agents || []) {
      const config = agent.config || {};
      
      // Buscar en triggers de automation (maneja objetos y strings)
      const triggers = config.automation?.actionTriggers || [];
      const foundByTriggers = triggers.some(t => {
        if (typeof t === 'string') {
          return t.toLowerCase().includes(trigger.toLowerCase());
        } else if (t && t.keyword) {
          // Manejar formato: {type: 'contains', keyword: 'Hola', priority: 5}
          return t.keyword.toLowerCase().includes(trigger.toLowerCase());
        }
        return false;
      });
      
      if (foundByTriggers) {
        console.log(`✅ Found agent by actionTriggers: ${agent.name}`);
        return agent;
      }
      
      // Buscar en knowledge Q&As
      const qandas = config.knowledge?.qandas || [];
      const foundByQA = qandas.some(qa => {
        return qa.question && qa.question.toLowerCase().includes(trigger.toLowerCase());
      });
      
      if (foundByQA) {
        console.log(`✅ Found agent by knowledge Q&A: ${agent.name}`);
        return agent;
      }
      
      // Buscar por nombre del agente
      if (agent.name.toLowerCase().includes(trigger.toLowerCase())) {
        console.log(`✅ Found agent by name: ${agent.name}`);
        return agent;
      }
    }

    // NO usar fallback - solo responder si hay match específico
    console.log(`❌ No se encontró agente específico para trigger: "${trigger}"`);
    
    // Comentado: No usar fallback automático
    // if (agents && agents.length > 0) {
    //   console.log(`🔄 Using fallback agent: ${agents[0].name}`);
    //   return agents[0];
    // }
    
    return null;
  } catch (error) {
    console.error('Error obteniendo agente:', error);
    return null;
  }
}

// Función para actualizar estadísticas del agente (adaptada a tu estructura)
async function updateAgentStats(agentId) {
  try {
    await supabase
      .from('agents')
      .update({
        message_count: supabase.raw('message_count + 1'),
        last_message_at: new Date().toISOString(),
        metrics_updated_at: new Date().toISOString()
      })
      .eq('id', agentId);
      
    console.log(`📊 Estadísticas actualizadas para agente: ${agentId}`);
  } catch (error) {
    console.error('Error actualizando estadísticas del agente:', error);
  }
}

// Función para llamar a Gemini API con prompt del agente (adaptada a tu estructura)
async function callGeminiAPIWithAgent(userMessage, agent = null) {
  try {
    // Extraer prompt del agente usando tu estructura de config
    let prompt = autoResponseConfig.prompt; // fallback
    
    if (agent?.config?.persona?.instructions) {
      prompt = agent.config.persona.instructions;
      console.log(`🤖 Usando prompt del agente: ${agent.name}`);
    } else if (agent?.config?.persona?.systemMessage && agent.config.persona.systemMessage !== 'Sin especificar') {
      prompt = agent.config.persona.systemMessage;
    }
    
    const requestBody = {
      contents: [{
        parts: [{
          text: `${prompt}\n\nMensaje del usuario: ${userMessage}`
        }]
      }]
    };

    console.log(`🧠 Calling Gemini API with agent: ${agent?.name || 'default'}...`);

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No text response from Gemini');
    }
    
    // Actualizar estadísticas del agente si se usó uno específico
    if (agent?.id) {
      await updateAgentStats(agent.id);
    }
    
    return text.trim();
    
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    throw error;
  }
}

// Función para crear directorio de autenticación
async function ensureAuthDir(sessionId) {
  const fs = await import('fs/promises');
  const authDir = path.join(process.cwd(), 'sessions', sessionId);
  await fs.mkdir(authDir, { recursive: true });
  return authDir;
}

// Health check (público, sin autenticación)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    version: '1.0.0',
    sessions: sessions.size,
    connectedSessions: Array.from(sessions.values()).filter(s => s.status === 'connected').length
  });
});

// APLICAR SEGURIDAD A TODAS LAS RUTAS DE API
app.use('/api/v1', authenticateAPIKey, rateLimit);

// Crear sesión
app.post('/api/v1/sessions', async (req, res) => {
  try {
    const { sessionName } = req.body;
    
    if (!sessionName || !/^[a-zA-Z0-9]+$/.test(sessionName)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'sessionName debe contener solo letras y números',
          timestamp: new Date()
        }
      });
    }

    // Verificar si ya existe
    for (const [id, session] of sessions) {
      if (session.sessionName === sessionName) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SESSION_ALREADY_EXISTS',
            message: `Session ${sessionName} already exists`,
            timestamp: new Date()
          }
        });
      }
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const session = {
      id: sessionId,
      userId: 'test-user-id',
      sessionName,
      phoneNumber: req.body.phoneNumber || null,
      status: 'disconnected',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    sessions.set(sessionId, session);
    
    console.log(`✅ Sesión creada: ${sessionName} (${sessionId})`);
    res.status(201).json({ success: true, data: session });
    
  } catch (error) {
    console.error('Error creando sesión:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Listar sesiones
app.get('/api/v1/sessions', (req, res) => {
  const sessionsList = Array.from(sessions.values());
  res.json({ success: true, data: sessionsList });
});

// Estado de sesión
app.get('/api/v1/sessions/:sessionId/status', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', timestamp: new Date() }
    });
  }
  res.json({ success: true, data: session });
});

// Conectar sesión
app.post('/api/v1/sessions/:sessionId/connect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', timestamp: new Date() }
      });
    }

    if (sockets.has(sessionId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'SESSION_ALREADY_CONNECTING', message: 'Session is already connecting', timestamp: new Date() }
      });
    }

    // PRODUCCIÓN: NO cerrar sesiones existentes - permitir múltiples instancias
    console.log(`📊 Sesiones activas: ${sockets.size}`);
    console.log(`📊 Session managers: ${sessionManagers.size}`);
    
    // Verificar si esta sesión específica ya está conectándose
    const sessionManager = getOrCreateSessionManager(sessionId);
    if (sessionManager.isConnecting) {
      return res.status(400).json({
        success: false,
        error: { code: 'SESSION_CONNECTING', message: 'Session is already connecting', timestamp: new Date() }
      });
    }

    console.log(`🔗 Conectando sesión: ${sessionId}`);
    
    // Marcar como conectándose en el session manager
    sessionManager.isConnecting = true;
    sessionManager.reconnectAttempts = 0;
    
    // Actualizar estado
    session.status = 'connecting';
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Crear directorio de autenticación - PRODUCCIÓN: cada sesión tiene su directorio
    const authDir = await ensureAuthDir(sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    
    // Guardar state en session manager
    sessionManager.state = state;

    // PRODUCCIÓN: Browser único y configuración optimizada para múltiples instancias
    const selectedBrowser = [
      `Setter-${sessionId}`, 
      'Chrome', 
      `${Date.now()}.${Math.random().toString(36).substr(2, 8)}`
    ];
    
    console.log(`🌐 Browser único para ${sessionId}: ${selectedBrowser.join(' ')}`);
    
    // CONFIGURACIÓN OPTIMIZADA PARA PRODUCCIÓN
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // Deshabilitado para múltiples instancias
      browser: selectedBrowser,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false, // IMPORTANTE: No sincronizar historial completo
      markOnlineOnConnect: false,
      shouldSyncHistoryMessage: () => false, // PRODUCCIÓN: No sincronizar mensajes
      defaultQueryTimeoutMs: 60000, // Timeout más largo
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      getMessage: async (key) => {
        return { conversation: 'Hello' };
      }
    });

    // Guardar socket en session manager y mapa global
    sessionManager.socket = socket;
    sockets.set(sessionId, socket);

    // Variable para datos de autenticación
    let qrCode = null;
    let pairingCode = null;

    // Debug: Verificar datos de sesión
    console.log(`🔍 Datos de sesión para ${sessionId}:`, {
      sessionName: session.sessionName,
      phoneNumber: session.phoneNumber,
      hasPhoneNumber: !!session.phoneNumber
    });

    // SIGUIENDO DOCUMENTACIÓN OFICIAL: NO generar pairing code aquí
    // El pairing code se generará en el event handler connection.update
    if (session.phoneNumber) {
      console.log(`📱 Sesión configurada para pairing code: ${session.phoneNumber}`);
    } else {
      console.log(`📱 Sesión configurada para QR code`);
    }

    // SIGUIENDO DOCUMENTACIÓN OFICIAL: manejar connection.update
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log(`📡 Connection update para ${sessionId}:`, { 
        connection, 
        qr: qr ? 'QR_RECEIVED' : 'NO_QR',
        hasPhoneNumber: !!session.phoneNumber,
        lastDisconnect: lastDisconnect?.error?.message
      });

      // SIGUIENDO DOCUMENTACIÓN: generar pairing code cuando connection=="connecting" O qr
      if ((connection === "connecting" || !!qr) && session.phoneNumber) {
        try {
          console.log(`📱 Generando pairing code para: ${session.phoneNumber}`);
          
          // SIGUIENDO DOCUMENTACIÓN: E.164 format sin +
          const cleanPhoneNumber = session.phoneNumber.replace(/[^0-9]/g, '');
          console.log(`📞 Número limpio: ${cleanPhoneNumber}`);
          
          pairingCode = await socket.requestPairingCode(cleanPhoneNumber);
          
          console.log(`\n🔢 ===============================`);
          console.log(`🔢 PAIRING CODE GENERADO`);
          console.log(`🔢 Session: ${sessionId}`);
          console.log(`🔢 Phone: ${session.phoneNumber}`);
          console.log(`🔢 Code: ${pairingCode}`);
          console.log(`🔢 ===============================\n`);
          console.log(`📱 Instrucciones para WhatsApp:`);
          console.log(`   1. Abre WhatsApp en tu teléfono`);
          console.log(`   2. Ve a Configuración > Dispositivos vinculados`);
          console.log(`   3. Toca "Vincular un dispositivo"`);
          console.log(`   4. Toca "Vincular con número de teléfono"`);
          console.log(`   5. Ingresa el código: ${pairingCode}`);
          console.log(`\n⏰ El código expira en 60 segundos\n`);
          
          // Guardar código de emparejamiento
          pairingCodes.set(sessionId, {
            code: pairingCode,
            phoneNumber: session.phoneNumber,
            expiresAt: new Date(Date.now() + 60000)
          });
          
          session.pairingCode = pairingCode;
          sessions.set(sessionId, session);
          
        } catch (error) {
          console.error(`❌ Error generando pairing code:`, error);
        }
      }

      // SIGUIENDO DOCUMENTACIÓN: generar QR solo si no hay número
      if (qr && !session.phoneNumber) {
        qrCode = await QRCode.toDataURL(qr);
        
        console.log(`\n📱 ===============================`);
        console.log(`📱 QR CODE GENERADO PARA SESIÓN`);
        console.log(`📱 Session: ${sessionId}`);
        console.log(`📱 ===============================`);
        
        // SIGUIENDO DOCUMENTACIÓN: usar método oficial para terminal
        try {
          console.log('\n🔍 ESCANEA ESTE QR CON WHATSAPP:\n');
          console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
          console.log('\n📱 Instrucciones:');
          console.log('   1. Abre WhatsApp en tu teléfono');
          console.log('   2. Ve a Configuración > Dispositivos vinculados');
          console.log('   3. Toca "Vincular un dispositivo"');
          console.log('   4. Escanea el QR de arriba');
          console.log(`\n⏰ El QR expira en 60 segundos\n`);
        } catch (terminalError) {
          // Fallback si falla el terminal QR
          qrTerminal.generate(qr, { small: true });
        }
        
        // Guardar en sesión
        session.qrCode = qrCode;
        session.qrExpiresAt = new Date(Date.now() + 60000);
        sessions.set(sessionId, session);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message;
        
        console.log(`❌ Conexión cerrada para ${sessionId}. Código: ${statusCode}, Error: ${errorMessage}`);
        
        // SIGUIENDO DOCUMENTACIÓN: manejar restartRequired
        if (statusCode === DisconnectReason.restartRequired) {
          console.log(`🔄 RestartRequired para ${sessionId} - Reconectando automáticamente...`);
          
          try {
            // Crear nuevo socket con las credenciales guardadas
            const authDir = await ensureAuthDir(sessionId);
            const { state, saveCreds } = await useMultiFileAuthState(authDir);
            
            // Usar mismo browser fingerprint
            const randomBrowser = [
              ['Setter-Baileys', 'Chrome', `1.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
              ['WhatsApp-Web', 'Firefox', `2.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
              ['WA-Client', 'Safari', `3.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
              ['Baileys-App', 'Edge', `4.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`]
            ];
            const selectedBrowser = randomBrowser[Math.floor(Math.random() * randomBrowser.length)];
            
            console.log(`🌐 Reconectando con browser: ${selectedBrowser.join(' ')}`);
            
            const newSocket = makeWASocket({
              auth: state,
              printQRInTerminal: false, // Ya está autenticado
              browser: selectedBrowser,
              generateHighQualityLinkPreview: false,
              syncFullHistory: false,
              markOnlineOnConnect: true,
              getMessage: async (key) => {
                return { conversation: 'Hello' };
              }
            });

            // Reemplazar socket en el mapa
            sockets.set(sessionId, newSocket);
            
            // Re-configurar eventos para el nuevo socket
            newSocket.ev.on('connection.update', async (update) => {
              const { connection: newConnection, lastDisconnect: newDisconnect } = update;
              
              if (newConnection === 'open') {
                console.log(`✅ Reconexión exitosa para ${sessionId}!`);
                session.status = 'connected';
                session.phoneNumber = newSocket.user?.id?.split(':')[0];
                session.updatedAt = new Date();
                sessions.set(sessionId, session);
              } else if (newConnection === 'close') {
                const newStatusCode = (newDisconnect?.error as Boom)?.output?.statusCode;
                console.log(`❌ Nueva desconexión para ${sessionId}: ${newStatusCode}`);
                
                if (newStatusCode === DisconnectReason.loggedOut) {
                  session.status = 'disconnected';
                  console.log(`🚪 Sesión ${sessionId} desconectada (logout)`);
                } else {
                  session.status = 'error';
                  console.log(`⚠️ Error en reconexión para ${sessionId}`);
                }
                
                session.updatedAt = new Date();
                sessions.set(sessionId, session);
                sockets.delete(sessionId);
              }
            });
            
            newSocket.ev.on('creds.update', saveCreds);

            // IMPORTANTE: Re-configurar event handler para auto-respuesta en socket reconectado
            newSocket.ev.on('messages.upsert', async (m) => {
              const message = m.messages[0];
              
              // Solo procesar mensajes nuevos de otros usuarios (no nuestros)
              if (!message.key.fromMe && m.type === 'notify') {
                const messageText = message.message?.conversation || 
                                  message.message?.extendedTextMessage?.text || '';
                
                const senderJid = message.key.remoteJid;
                const senderName = message.pushName || 'Usuario';
                
                console.log(`📥 Mensaje recibido (reconectado) de ${senderName} (${senderJid}): ${messageText}`);
                
                // USAR LA MISMA LÓGICA SUPABASE QUE EL HANDLER PRINCIPAL
                if (!messageText || messageText.trim() === '') {
                  console.log(`⚠️ Mensaje vacío ignorado (reconectado)`);
                  return;
                }

                console.log(`🔍 Procesando auto-respuesta (reconectado) para: "${messageText}"`);
                
                // Buscar agentes activos por triggers (misma lógica que handler principal)
                const words = messageText.toLowerCase().split(/\s+/);
                let activeAgent = null;
                let detectedTrigger = null;
                
                // Buscar si alguna palabra coincide con un trigger de agente
                for (const word of words) {
                  const agent = await getActiveAgentByTrigger(word, sessionId, session.userId);
                  if (agent) {
                    activeAgent = agent;
                    detectedTrigger = word;
                    break;
                  }
                }
                
                // También verificar configuración global como fallback
                const hasGlobalTrigger = autoResponseConfig.enabled && 
                  messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase());
                
                if (activeAgent || hasGlobalTrigger) {
                  const triggerUsed = activeAgent?.name || autoResponseConfig.triggerWord;
                  
                  console.log(`🚀 TRIGGER DETECTADO (reconectado)! Trigger: "${detectedTrigger || autoResponseConfig.triggerWord}", Agente: ${activeAgent?.name || 'global'}`);
                  
                  try {
                    // Llamar a Gemini API con agente específico o configuración global
                    console.log(`🧠 Llamando a Gemini API (reconectado) con agente: ${activeAgent?.name || 'default'}...`);
                    const geminiResponse = await callGeminiAPIWithAgent(messageText, activeAgent);
                    
                    console.log(`🧠 Respuesta de Gemini (reconectado): ${geminiResponse}`);
                    
                    // Enviar respuesta automática
                    await newSocket.sendMessage(senderJid, { text: geminiResponse });
                    
                    console.log(`✅ Auto-respuesta enviada a ${senderName} (reconectado)`);
                    
                    // Actualizar estadísticas del agente si aplica
                    if (activeAgent) {
                      await updateAgentStats(activeAgent.id);
                    }
                    
                  } catch (error) {
                    console.error(`❌ Error en auto-respuesta (reconectado):`, error);
                    
                    // Enviar mensaje de error como fallback
                    try {
                      await newSocket.sendMessage(senderJid, { 
                        text: '🤖 Hola! Soy Setter IA, pero tengo un problema técnico. Intenta de nuevo en unos minutos. 🔧' 
                      });
                    } catch (fallbackError) {
                      console.error(`❌ Error enviando fallback (reconectado):`, fallbackError);
                    }
                  }
                }
              }
            });
            
            // Actualizar estado a reconectando
            session.status = 'reconnecting';
            session.updatedAt = new Date();
            sessions.set(sessionId, session);
            
          } catch (reconnectError) {
            console.error(`❌ Error en reconexión automática para ${sessionId}:`, reconnectError);
            session.status = 'error';
            session.updatedAt = new Date();
            sessions.set(sessionId, session);
            sockets.delete(sessionId);
          }
          
        } else if (statusCode === DisconnectReason.loggedOut) {
          session.status = 'disconnected';
          console.log(`🚪 Sesión ${sessionId} desconectada (logout)`);
          sockets.delete(sessionId);
        } else if (statusCode === DisconnectReason.deviceClosed) {
          session.status = 'error';
          console.log(`📱 Dispositivo cerrado para ${sessionId}`);
          sockets.delete(sessionId);
        } else if (statusCode === DisconnectReason.connectionClosed) {
          session.status = 'disconnected';
          console.log(`🔌 Conexión cerrada para ${sessionId}`);
          sockets.delete(sessionId);
        } else if (statusCode === DisconnectReason.connectionLost) {
          session.status = 'disconnected';
          console.log(`📡 Conexión perdida para ${sessionId}`);
          sockets.delete(sessionId);
        } else {
          session.status = 'error';
          console.log(`⚠️ Error desconocido para ${sessionId}: ${errorMessage}`);
          sockets.delete(sessionId);
        }
        
        session.updatedAt = new Date();
        sessions.set(sessionId, session);
        
      } else if (connection === 'open') {
        console.log(`✅ Sesión ${sessionId} conectada exitosamente!`);
        
        // Actualizar session manager
        sessionManager.isConnecting = false;
        sessionManager.reconnectAttempts = 0;
        sessionManager.updateActivity();
        
        session.status = 'connected';
        session.phoneNumber = socket.user?.id?.split(':')[0];
        session.updatedAt = new Date();
        session.qrCode = null; // Limpiar QR
        session.pairingCode = null; // Limpiar pairing code
        sessions.set(sessionId, session);
        
        // Limpiar código de emparejamiento almacenado
        pairingCodes.delete(sessionId);
        
        console.log(`📊 Total de sesiones conectadas: ${Array.from(sessions.values()).filter(s => s.status === 'connected').length}`);
      }
    });

    // Guardar credenciales
    socket.ev.on('creds.update', saveCreds);

    // Event handler para mensajes entrantes - AUTO RESPUESTA CON GEMINI
    // SIGUIENDO DOCUMENTACIÓN OFICIAL: usar destructuring { messages }
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`🔔 Event messages.upsert triggered para ${sessionId}`);
      console.log(`📋 Mensajes recibidos:`, messages.length);
      console.log(`📋 Tipo de evento:`, type);
      
      // Procesar cada mensaje
      for (const message of messages) {
        if (!message || !message.message) {
          console.log(`⚠️ Mensaje vacío o sin contenido`);
          continue;
        }
        
        console.log(`📱 Mensaje completo:`, {
          key: message.key,
          fromMe: message.key.fromMe,
          type: type,
          messageType: Object.keys(message.message || {}),
          pushName: message.pushName
        });
        
        // SIGUIENDO DOCUMENTACIÓN: Solo procesar mensajes de otros usuarios (no nuestros) y tipo 'notify'
        if (!message.key.fromMe && type === 'notify') {
          // SIGUIENDO DOCUMENTACIÓN: Manejar diferentes tipos de mensajes
          // Extraer contenido del mensaje según tipo
          let messageText = '';
          let messageType = 'unknown';
          let mediaData = null;

          if (message.message?.conversation) {
            messageText = message.message.conversation;
            messageType = 'text';
          } else if (message.message?.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text;
            messageType = 'text';
          } else if (message.message?.imageMessage) {
            messageText = message.message.imageMessage.caption || '';
            messageType = 'image';
            mediaData = {
              mimetype: message.message.imageMessage.mimetype,
              fileLength: message.message.imageMessage.fileLength,
              width: message.message.imageMessage.width,
              height: message.message.imageMessage.height
            };
          } else if (message.message?.audioMessage) {
            messageText = 'Audio message';
            messageType = 'audio';
            mediaData = {
              mimetype: message.message.audioMessage.mimetype,
              fileLength: message.message.audioMessage.fileLength,
              seconds: message.message.audioMessage.seconds
            };
          } else if (message.message?.documentMessage) {
            messageText = message.message.documentMessage.title || 'Document';
            messageType = 'document';
            mediaData = {
              mimetype: message.message.documentMessage.mimetype,
              fileLength: message.message.documentMessage.fileLength,
              fileName: message.message.documentMessage.fileName
            };
          }
          
          const senderJid = message.key.remoteJid;
          const senderName = message.pushName || 'Usuario';
          
          // GUARDAR MENSAJE EN HISTORIAL (en producción usar DB)
          const messageData = {
            id: message.key.id,
            from: senderJid,
            fromName: senderName,
            type: messageType,
            text: messageText,
            mediaData,
            timestamp: new Date(),
            sessionId
          };
          
          if (!messageHistory.has(sessionId)) {
            messageHistory.set(sessionId, []);
          }
          messageHistory.get(sessionId).push(messageData);
          
          console.log(`📥 MENSAJE ENTRANTE (${messageType}) de ${senderName} (${senderJid}): "${messageText}"`);
          console.log(`🤖 Config auto-respuesta:`, {
            enabled: autoResponseConfig.enabled,
            triggerWord: autoResponseConfig.triggerWord,
            messageContainsTrigger: messageText ? messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase()) : false
          });
          
          // NUEVA LÓGICA: Buscar agentes activos por triggers en Supabase
          if (messageText) {
            // Buscar palabras triggers en el mensaje
            const words = messageText.toLowerCase().split(/\s+/);
            let activeAgent = null;
            let detectedTrigger = null;
            
            // Buscar si alguna palabra coincide con un trigger de agente
            for (const word of words) {
              const agent = await getActiveAgentByTrigger(word, sessionId, session.userId);
              if (agent) {
                activeAgent = agent;
                detectedTrigger = word;
                break;
              }
            }
            
            // También verificar configuración global como fallback
            const hasGlobalTrigger = autoResponseConfig.enabled && 
              messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase());
            
            if (activeAgent || hasGlobalTrigger) {
              const triggerUsed = activeAgent?.action_trigger || autoResponseConfig.triggerWord;
              
              console.log(`🚀 TRIGGER DETECTADO! Sesión: ${sessionId}, Trigger: "${triggerUsed}", Agente: ${activeAgent?.nombre || 'global'}`);
              
              // Actualizar actividad del session manager
              const sessionManager = sessionManagers.get(sessionId);
              if (sessionManager) {
                sessionManager.updateActivity();
              }
              
              try {
                // Llamar a Gemini API con agente específico o configuración global
                console.log(`🧠 Llamando a Gemini API con agente: ${activeAgent?.nombre || 'default'}...`);
                const geminiResponse = await callGeminiAPIWithAgent(messageText, activeAgent);
                
                console.log(`💡 Respuesta de Gemini para ${sessionId}: ${geminiResponse}`);
                
                // Enviar respuesta automática
                await socket.sendMessage(senderJid, { text: geminiResponse });
                
                console.log(`✅ AUTO-RESPUESTA ENVIADA desde ${sessionId} a ${senderName} usando agente: ${activeAgent?.nombre || 'default'}`);
                
              } catch (error) {
                console.error(`❌ Error en auto-respuesta para ${sessionId}:`, error);
                
                // Enviar mensaje de error como fallback
                try {
                  await socket.sendMessage(senderJid, { 
                    text: '🤖 Hola! Soy Setter IA, pero tengo un problema técnico. Intenta de nuevo en unos minutos. 🔧' 
                  });
                  console.log(`📤 Mensaje de fallback enviado desde ${sessionId} a ${senderName}`);
                } catch (fallbackError) {
                  console.error(`❌ Error enviando fallback desde ${sessionId}:`, fallbackError);
                }
              }
            } else {
              console.log(`🔇 Mensaje ignorado en ${sessionId} - no se encontraron triggers activos`);
            }
          }
        } else {
          console.log(`🔇 Mensaje ignorado - fromMe: ${message.key.fromMe}, type: ${type}`);
        }
      }
    });

    // Responder con datos de autenticación si están disponibles
    const responseData = { 
      sessionId,
      status: 'connecting',
      message: 'Session connecting...'
    };

    if (pairingCode) {
      responseData.code = pairingCode;
      responseData.phoneNumber = session.phoneNumber;
      responseData.message = 'Pairing code generated';
      console.log(`✅ Enviando código de emparejamiento en respuesta: ${pairingCode}`);
    } else {
      responseData.message = 'QR will be available soon';
      console.log(`📱 Sin código de emparejamiento, esperando QR`);
    }

    console.log(`📤 Respuesta de conexión:`, responseData);
    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error('Error conectando sesión:', error);
    
    // Actualizar estado a error
    const session = sessions.get(req.params.sessionId);
    if (session) {
      session.status = 'error';
      session.updatedAt = new Date();
      sessions.set(req.params.sessionId, session);
    }
    
    res.status(500).json({
      success: false,
      error: { code: 'CONNECTION_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Obtener QR code
app.get('/api/v1/sessions/:sessionId/qr', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', timestamp: new Date() }
    });
  }

  if (!session.qrCode) {
    return res.status(404).json({
      success: false,
      error: { code: 'QR_NOT_AVAILABLE', message: 'QR code not available yet', timestamp: new Date() }
    });
  }

  res.json({
    success: true,
    data: {
      sessionId: session.id,
      qrCode: session.qrCode,
      expiresAt: session.qrExpiresAt
    }
  });
});

// Obtener código de emparejamiento
app.get('/api/v1/sessions/:sessionId/pairing-code', (req, res) => {
  const { sessionId } = req.params;
  const pairingData = pairingCodes.get(sessionId);
  
  if (!pairingData) {
    return res.status(404).json({
      success: false,
      error: { code: 'PAIRING_CODE_NOT_FOUND', message: 'Pairing code not available', timestamp: new Date() }
    });
  }

  // Verificar si no ha expirado
  if (new Date() > pairingData.expiresAt) {
    pairingCodes.delete(sessionId);
    return res.status(404).json({
      success: false,
      error: { code: 'PAIRING_CODE_EXPIRED', message: 'Pairing code has expired', timestamp: new Date() }
    });
  }

  res.json({
    success: true,
    data: {
      sessionId,
      code: pairingData.code,
      phoneNumber: pairingData.phoneNumber,
      expiresAt: pairingData.expiresAt
    }
  });
});

// Enviar mensaje
app.post('/api/v1/sessions/:sessionId/send-message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, type, content } = req.body;

    const socket = sockets.get(sessionId);
    const session = sessions.get(sessionId);
    
    if (!socket || !session || session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'SESSION_NOT_CONNECTED', 
          message: `Session is not connected. Current status: ${session?.status || 'not found'}`,
          timestamp: new Date() 
        }
      });
    }

    console.log(`📤 Enviando mensaje a ${to} via ${sessionId}`);

    let result;
    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

    if (type === 'text') {
      result = await socket.sendMessage(jid, { text: content.text });
    } else if (type === 'image') {
      if (content.url) {
        // Enviar imagen desde URL
        result = await socket.sendMessage(jid, { 
          image: { url: content.url },
          caption: content.caption || ''
        });
      } else if (content.buffer) {
        // Enviar imagen desde buffer
        result = await socket.sendMessage(jid, { 
          image: Buffer.from(content.buffer, 'base64'),
          caption: content.caption || ''
        });
      } else {
        throw new Error('Image message requires url or buffer');
      }
    } else if (type === 'audio') {
      if (content.url) {
        result = await socket.sendMessage(jid, { 
          audio: { url: content.url },
          mimetype: 'audio/mp4'
        });
      } else if (content.buffer) {
        result = await socket.sendMessage(jid, { 
          audio: Buffer.from(content.buffer, 'base64'),
          mimetype: 'audio/mp4'
        });
      } else {
        throw new Error('Audio message requires url or buffer');
      }
    } else if (type === 'document') {
      if (content.url || content.buffer) {
        result = await socket.sendMessage(jid, {
          document: content.url ? { url: content.url } : Buffer.from(content.buffer, 'base64'),
          fileName: content.fileName || 'document',
          mimetype: content.mimetype || 'application/octet-stream'
        });
      } else {
        throw new Error('Document message requires url or buffer');
      }
    } else {
      throw new Error(`Message type ${type} not supported. Supported: text, image, audio, document`);
    }

    console.log(`✅ Mensaje enviado: ${result.key.id}`);

    res.json({
      success: true,
      data: { 
        messageId: result.key.id, 
        status: 'sent', 
        timestamp: new Date() 
      }
    });

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({
      success: false,
      error: { code: 'MESSAGE_SEND_FAILED', message: error.message, timestamp: new Date() }
    });
  }
});

// Limpiar todas las sesiones
app.post('/api/v1/sessions/cleanup', async (req, res) => {
  try {
    console.log('🧹 Iniciando limpieza completa de sesiones...');
    
    const socketsCount = sockets.size;
    const sessionsCount = sessions.size;
    
    // Cerrar todos los sockets con más tiempo
    for (const [sessionId, socket] of sockets) {
      try {
        console.log(`🛑 Cerrando socket: ${sessionId}`);
        
        // Intentar logout primero
        try {
          await socket.logout();
        } catch (logoutError) {
          console.warn(`⚠️ Error en logout ${sessionId}:`, logoutError.message);
        }
        
        // Forzar cierre del socket
        socket.end();
        
        // Esperar un poco para asegurar cierre
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.warn(`⚠️ Error cerrando socket ${sessionId}:`, error.message);
      }
    }
    
    // Limpiar todos los almacenamientos
    sockets.clear();
    sessions.clear();
    pairingCodes.clear();
    
    // Limpiar todos los directorios de autenticación de forma más agresiva
    try {
      const fs = await import('fs/promises');
      const sessionsDir = path.join(process.cwd(), 'sessions');
      
      // Esperar un poco antes de limpiar archivos
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Limpiar directorio completo
      await fs.rm(sessionsDir, { recursive: true, force: true });
      await fs.mkdir(sessionsDir, { recursive: true });
      
      console.log('🗂️ Directorios de autenticación limpiados completamente');
    } catch (error) {
      console.warn('⚠️ Error limpiando directorios:', error.message);
    }
    
    console.log('✅ Limpieza completa finalizada');
    res.json({ 
      success: true, 
      data: { 
        message: 'All sessions cleaned successfully',
        clearedSessions: sessionsCount,
        clearedSockets: socketsCount,
        timestamp: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Error en limpieza:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CLEANUP_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Endpoint de reset completo del sistema
app.post('/api/v1/system/reset', async (req, res) => {
  try {
    console.log('🔄 RESET COMPLETO DEL SISTEMA...');
    
    const socketsCount = sockets.size;
    const sessionsCount = sessions.size;
    
    // Forzar cierre de todos los sockets sin esperar logout
    for (const [sessionId, socket] of sockets) {
      try {
        console.log(`💀 Forzando cierre: ${sessionId}`);
        socket.end();
      } catch (error) {
        console.warn(`⚠️ Error forzando cierre ${sessionId}:`, error.message);
      }
    }
    
    // Limpiar TODA la memoria inmediatamente
    sockets.clear();
    sessions.clear();
    pairingCodes.clear();
    
    // Limpiar directorios de forma más agresiva
    try {
      const fs = await import('fs/promises');
      const sessionsDir = path.join(process.cwd(), 'sessions');
      
      // Forzar eliminación completa
      await fs.rm(sessionsDir, { recursive: true, force: true });
      
      // Esperar antes de recrear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Recrear directorio limpio
      await fs.mkdir(sessionsDir, { recursive: true });
      
      console.log('💥 Sistema completamente reseteado');
    } catch (error) {
      console.warn('⚠️ Error en reset de directorios:', error.message);
    }
    
    res.json({ 
      success: true, 
      data: { 
        message: 'System completely reset',
        clearedSessions: sessionsCount,
        clearedSockets: socketsCount,
        resetTimestamp: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Error en reset:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RESET_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Configurar auto-respuesta
app.post('/api/v1/auto-response/config', (req, res) => {
  try {
    const { enabled, triggerWord, prompt } = req.body;
    
    if (enabled !== undefined) autoResponseConfig.enabled = enabled;
    if (triggerWord) autoResponseConfig.triggerWord = triggerWord;
    if (prompt) autoResponseConfig.prompt = prompt;
    
    console.log(`🤖 Auto-respuesta configurada:`, autoResponseConfig);
    
    res.json({
      success: true,
      data: {
        message: 'Auto-response configuration updated',
        config: autoResponseConfig
      }
    });
    
  } catch (error) {
    console.error('Error configurando auto-respuesta:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Obtener configuración de auto-respuesta
app.get('/api/v1/auto-response/config', (req, res) => {
  res.json({
    success: true,
    data: autoResponseConfig
  });
});

// Test Gemini API endpoint
app.post('/api/v1/auto-response/test', async (req, res) => {
  try {
    const testMessage = req.body.message || 'Hola, este es un mensaje de prueba';
    const trigger = req.body.trigger || null;
    
    console.log('🧪 Testing Gemini API with message:', testMessage);
    
    let agent = null;
    if (trigger) {
      agent = await getActiveAgentByTrigger(trigger);
      console.log('🤖 Found agent:', agent?.nombre || 'none');
    }
    
    const response = await callGeminiAPIWithAgent(testMessage, agent);
    
    res.json({
      success: true,
      data: {
        message: 'Gemini test successful',
        input: testMessage,
        output: response,
        agent: agent ? { id: agent.id, nombre: agent.nombre, trigger: agent.action_trigger } : null,
        config: autoResponseConfig
      }
    });
    
  } catch (error) {
    console.error('❌ Error testing Gemini:', error);
    res.status(500).json({
      success: false,
      error: { 
        code: 'GEMINI_TEST_ERROR', 
        message: error.message, 
        timestamp: new Date() 
      }
    });
  }
});

// ========== ENDPOINTS PARA GESTIÓN DE AGENTES ==========

// Crear agente
app.post('/api/v1/agents', async (req, res) => {
  try {
    const { nombre, descripcion, action_trigger, prompt, session_id, user_id, config } = req.body;
    
    if (!nombre || !action_trigger || !prompt) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'nombre, action_trigger y prompt son requeridos', timestamp: new Date() }
      });
    }

    const { data, error } = await supabase
      .from('agentes')
      .insert([{
        nombre,
        descripcion,
        action_trigger: action_trigger.toLowerCase(),
        prompt,
        session_id,
        user_id,
        config: config || {}
      }])
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Agente creado: ${nombre} (trigger: ${action_trigger})`);
    res.status(201).json({ success: true, data });
    
  } catch (error) {
    console.error('Error creando agente:', error);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_AGENT_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Listar agentes
app.get('/api/v1/agents', async (req, res) => {
  try {
    const { session_id, user_id, is_active = true } = req.query;
    
    let query = supabase.from('agentes').select('*');
    
    if (is_active !== 'all') {
      query = query.eq('is_active', is_active === 'true');
    }
    
    if (session_id) {
      query = query.eq('session_id', session_id);
    }
    
    if (user_id) {
      query = query.eq('user_id', user_id);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;

    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Error listando agentes:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_AGENTS_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Obtener agente específico
app.get('/api/v1/agents/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found', timestamp: new Date() }
      });
    }

    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Error obteniendo agente:', error);
    res.status(500).json({
      success: false,
      error: { code: 'GET_AGENT_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Actualizar agente
app.put('/api/v1/agents/:id', async (req, res) => {
  try {
    const { nombre, descripcion, action_trigger, prompt, is_active, config } = req.body;
    
    const updateData = {};
    if (nombre !== undefined) updateData.nombre = nombre;
    if (descripcion !== undefined) updateData.descripcion = descripcion;
    if (action_trigger !== undefined) updateData.action_trigger = action_trigger.toLowerCase();
    if (prompt !== undefined) updateData.prompt = prompt;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (config !== undefined) updateData.config = config;

    const { data, error } = await supabase
      .from('agentes')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Agente actualizado: ${data.nombre}`);
    res.json({ success: true, data });
    
  } catch (error) {
    console.error('Error actualizando agente:', error);
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_AGENT_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Eliminar agente
app.delete('/api/v1/agents/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .delete()
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Agente eliminado: ${data.nombre}`);
    res.json({ success: true, data: { message: 'Agent deleted successfully', deletedAgent: data } });
    
  } catch (error) {
    console.error('Error eliminando agente:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_AGENT_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Buscar agente por trigger
app.get('/api/v1/agents/by-trigger/:trigger', async (req, res) => {
  try {
    const { trigger } = req.params;
    const { session_id, user_id } = req.query;
    
    const agent = await getActiveAgentByTrigger(trigger, session_id, user_id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: { code: 'AGENT_NOT_FOUND', message: `No active agent found for trigger: ${trigger}`, timestamp: new Date() }
      });
    }

    res.json({ success: true, data: agent });
    
  } catch (error) {
    console.error('Error buscando agente por trigger:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SEARCH_AGENT_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Estadísticas de agentes
app.get('/api/v1/agents-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agentes')
      .select('id, nombre, action_trigger, total_activations, last_activation, is_active');

    if (error) throw error;

    const stats = {
      totalAgents: data.length,
      activeAgents: data.filter(a => a.is_active).length,
      totalActivations: data.reduce((sum, a) => sum + (a.total_activations || 0), 0),
      agents: data.map(agent => ({
        id: agent.id,
        nombre: agent.nombre,
        trigger: agent.action_trigger,
        activations: agent.total_activations || 0,
        lastActivation: agent.last_activation,
        isActive: agent.is_active
      }))
    };

    res.json({ success: true, data: stats });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Eliminar sesión individual
app.delete('/api/v1/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const socket = sockets.get(sessionId);
    
    console.log(`🗑️ Eliminando sesión: ${sessionId}`);
    
    // Cerrar socket de forma segura
    if (socket) {
      try {
        console.log('🛑 Cerrando socket...');
        await socket.logout();
        socket.end();
        console.log('✅ Socket cerrado correctamente');
      } catch (error) {
        console.warn('⚠️ Error al cerrar socket:', error.message);
      }
      sockets.delete(sessionId);
    }
    
    // Limpiar de almacenamientos
    sessions.delete(sessionId);
    pairingCodes.delete(sessionId);
    
    // Limpiar directorio de autenticación
    try {
      const fs = await import('fs/promises');
      const authDir = path.join(process.cwd(), 'sessions', sessionId);
      await fs.rm(authDir, { recursive: true, force: true });
      console.log('🗂️ Directorio de autenticación eliminado');
    } catch (error) {
      console.warn('⚠️ Error limpiando directorio:', error.message);
    }
    
    console.log(`✅ Sesión ${sessionId} eliminada completamente`);
    res.json({ success: true, data: { message: 'Session deleted successfully' } });
    
  } catch (error) {
    console.error('❌ Error eliminando sesión:', error);
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

// Error handler global
app.use((error, req, res, next) => {
  console.error('💥 Error global:', error);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: error.message, timestamp: new Date() }
  });
});

// Iniciar servidor
async function start() {
  try {
    // Crear directorio de sesiones
    const fs = await import('fs/promises');
    await fs.mkdir(path.join(process.cwd(), 'sessions'), { recursive: true });
    
    app.listen(port, () => {
      console.log(`🚀 Baileys Server corriendo en puerto ${port}`);
      console.log(`🌐 Health check: http://localhost:${port}/health`);
      console.log(`🧪 Interfaz de prueba: test/whatsapp-test-fixed.html`);
      console.log(`🔑 API Key: test-api-key-12345`);
      console.log(`📱 Listo para crear sesiones WhatsApp!`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar:', error);
    process.exit(1);
  }
}

// Cleanup al cerrar
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  
  // Cerrar todos los sockets
  for (const [sessionId, socket] of sockets) {
    try {
      console.log(`Cerrando sesión: ${sessionId}`);
      await socket.logout();
      socket.end();
    } catch (error) {
      console.warn(`Error cerrando ${sessionId}:`, error.message);
    }
  }
  
  process.exit(0);
});

start();