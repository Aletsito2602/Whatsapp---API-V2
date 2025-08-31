import express from 'express';
import cors from 'cors';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrTerminal from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import path from 'path';

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Storage para sesiones
const sessions = new Map();
const sockets = new Map();
const pairingCodes = new Map();

// Configuración de Gemini AI
const GEMINI_API_KEY = 'AIzaSyAKq_7car-bCXq9sOEPKMiua5OXh3--UTY';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Configuración de auto-respuesta (se actualizará desde el frontend)
let autoResponseConfig = {
  enabled: true,
  triggerWord: 'setter',
  prompt: 'Eres un asistente de IA llamado Setter. Responde de manera útil y amigable en español. Mantén tus respuestas concisas pero informativas. Siempre termina con un emoji relacionado al tema.'
};

// Función para llamar a Gemini API usando fetch global (Node 18+)
async function callGeminiAPI(userMessage) {
  try {
    const requestBody = {
      contents: [{
        parts: [{
          text: `${autoResponseConfig.prompt}\n\nMensaje del usuario: ${userMessage}`
        }]
      }]
    };

    console.log('🔗 Calling Gemini API...');
    console.log('📝 URL:', GEMINI_API_URL);
    console.log('🔑 API Key (first 20 chars):', GEMINI_API_KEY.substring(0, 20) + '...');
    console.log('📝 Request:', JSON.stringify(requestBody, null, 2));

    // Test con curl command equivalente para debug
    const curlCommand = `curl -X POST "${GEMINI_API_URL}" -H "Content-Type: application/json" -H "x-goog-api-key: ${GEMINI_API_KEY}" -d '${JSON.stringify(requestBody)}'`;
    console.log('🐚 Equivalent curl command:');
    console.log(curlCommand);

    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);
    console.log(`📡 Response headers:`, Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('📄 Raw response:', responseText);

    if (!response.ok) {
      console.error('❌ Gemini API error response:', responseText);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    const data = JSON.parse(responseText);
    console.log('✅ Gemini response parsed:', JSON.stringify(data, null, 2));
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No text response from Gemini');
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

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    version: '1.0.0',
    sessions: sessions.size
  });
});

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

    // Verificar si hay sockets activos y forzar delay MÁS LARGO
    if (sockets.size > 0) {
      console.log(`⚠️ Hay ${sockets.size} sesiones activas. Cerrando antes de crear nueva...`);
      
      // Cerrar todas las sesiones existentes
      for (const [existingId, socket] of sockets) {
        try {
          console.log(`🛑 Cerrando socket existente: ${existingId}`);
          socket.end(); // Solo end(), sin logout para evitar errores
        } catch (error) {
          console.warn(`Error cerrando sesión existente ${existingId}:`, error.message);
        }
      }
      
      sockets.clear();
      sessions.clear();
      pairingCodes.clear();
      
      // Esperar MÁS TIEMPO para que WhatsApp libere la conexión
      console.log('⏳ Esperando 10 segundos para liberar conexiones...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      console.log('🧹 Sesiones previas limpiadas, continuando...');
    }

    console.log(`🔗 Conectando sesión: ${sessionId}`);
    
    // Actualizar estado
    session.status = 'connecting';
    session.updatedAt = new Date();
    sessions.set(sessionId, session);

    // Crear directorio de autenticación
    const authDir = await ensureAuthDir(sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Crear socket con browser completamente único para cada sesión
    const randomBrowser = [
      ['Setter-Baileys', 'Chrome', `1.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
      ['WhatsApp-Web', 'Firefox', `2.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
      ['WA-Client', 'Safari', `3.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`],
      ['Baileys-App', 'Edge', `4.${Date.now()}.${Math.random().toString(36).substr(2, 5)}`]
    ];
    const selectedBrowser = randomBrowser[Math.floor(Math.random() * randomBrowser.length)];
    
    console.log(`🌐 Usando browser: ${selectedBrowser.join(' ')}`);
    
    // CORRIGIDO SEGÚN DOCUMENTACIÓN OFICIAL: configuración mínima
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: selectedBrowser,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async (key) => {
        return { conversation: 'Hello' };
      }
    });

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
                
                // Verificar si la auto-respuesta está habilitada y si el mensaje contiene la palabra disparadora
                if (autoResponseConfig.enabled && 
                    messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase())) {
                  console.log(`🤖 Trigger detectado en reconexión! Palabra: "${autoResponseConfig.triggerWord}" en mensaje: "${messageText}"`);
                  
                  try {
                    // Llamar a Gemini API
                    const geminiResponse = await callGeminiAPI(messageText);
                    
                    console.log(`🧠 Respuesta de Gemini (reconectado): ${geminiResponse}`);
                    
                    // Enviar respuesta automática
                    await newSocket.sendMessage(senderJid, { text: geminiResponse });
                    
                    console.log(`✅ Auto-respuesta enviada a ${senderName} (reconectado)`);
                    
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
        
        session.status = 'connected';
        session.phoneNumber = socket.user?.id?.split(':')[0];
        session.updatedAt = new Date();
        session.qrCode = null; // Limpiar QR
        session.pairingCode = null; // Limpiar pairing code
        sessions.set(sessionId, session);
        
        // Limpiar código de emparejamiento almacenado
        pairingCodes.delete(sessionId);
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
          const messageText = message.message?.conversation || 
                            message.message?.extendedTextMessage?.text ||
                            message.message?.imageMessage?.caption ||
                            '';
          
          const senderJid = message.key.remoteJid;
          const senderName = message.pushName || 'Usuario';
          
          console.log(`📥 MENSAJE ENTRANTE de ${senderName} (${senderJid}): "${messageText}"`);
          console.log(`🤖 Config auto-respuesta:`, {
            enabled: autoResponseConfig.enabled,
            triggerWord: autoResponseConfig.triggerWord,
            messageContainsTrigger: messageText ? messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase()) : false
          });
          
          // Verificar si la auto-respuesta está habilitada y si el mensaje contiene la palabra disparadora
          if (autoResponseConfig.enabled && 
              messageText && messageText.toLowerCase().includes(autoResponseConfig.triggerWord.toLowerCase())) {
            console.log(`🚀 TRIGGER DETECTADO! Palabra: "${autoResponseConfig.triggerWord}" en mensaje: "${messageText}"`);
            
            try {
              // Llamar a Gemini API
              console.log(`🧠 Llamando a Gemini API...`);
              const geminiResponse = await callGeminiAPI(messageText);
              
              console.log(`💡 Respuesta de Gemini: ${geminiResponse}`);
              
              // Enviar respuesta automática
              await socket.sendMessage(senderJid, { text: geminiResponse });
              
              console.log(`✅ AUTO-RESPUESTA ENVIADA a ${senderName}`);
              
            } catch (error) {
              console.error(`❌ Error en auto-respuesta:`, error);
              
              // Enviar mensaje de error como fallback
              try {
                await socket.sendMessage(senderJid, { 
                  text: '🤖 Hola! Soy Setter IA, pero tengo un problema técnico. Intenta de nuevo en unos minutos. 🔧' 
                });
                console.log(`📤 Mensaje de fallback enviado a ${senderName}`);
              } catch (fallbackError) {
                console.error(`❌ Error enviando fallback:`, fallbackError);
              }
            }
          } else {
            console.log(`🔇 Mensaje ignorado - no contiene trigger "${autoResponseConfig.triggerWord}" o auto-respuesta deshabilitada`);
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
    if (type === 'text') {
      result = await socket.sendMessage(`${to}@s.whatsapp.net`, { text: content.text });
    } else {
      throw new Error(`Message type ${type} not implemented yet`);
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
    console.log('🧪 Testing Gemini API with message:', testMessage);
    
    const response = await callGeminiAPI(testMessage);
    
    res.json({
      success: true,
      data: {
        message: 'Gemini test successful',
        input: testMessage,
        output: response,
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