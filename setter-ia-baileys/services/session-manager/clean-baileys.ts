import express from 'express';
import cors from 'cors';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  ConnectionState,
  WASocket,
  AuthenticationState 
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import qrTerminal from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const port = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// NUEVA ARQUITECTURA LIMPIA
interface CleanSession {
  id: string;
  name: string;
  phoneNumber?: string;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
  createdAt: Date;
  lastActivity: Date;
}

interface ActiveConnection {
  sessionId: string;
  socket: WASocket;
  authDir: string;
  authState: AuthenticationState;
  saveCreds: () => Promise<void>;
  qrData?: string;
  pairingCode?: string;
  isConnecting: boolean;
  cleanup: () => Promise<void>;
}

// GESTIÓN DE ESTADO ÚNICA Y LIMPIA
class SessionManager {
  private sessions = new Map<string, CleanSession>();
  private connections = new Map<string, ActiveConnection>();
  private connectionQueue: string[] = [];
  private isProcessingQueue = false;

  // SOLO UNA CONEXIÓN A LA VEZ
  private async processConnectionQueue() {
    if (this.isProcessingQueue || this.connectionQueue.length === 0) return;
    
    this.isProcessingQueue = true;
    
    while (this.connectionQueue.length > 0) {
      const sessionId = this.connectionQueue.shift()!;
      await this.connectSessionSafe(sessionId);
      
      // Esperar entre conexiones para respetar límites de WhatsApp
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    this.isProcessingQueue = false;
  }

  async createSession(name: string, phoneNumber?: string): Promise<CleanSession> {
    // Verificar límites
    if (this.sessions.size >= 3) {
      throw new Error('Maximum 3 sessions allowed');
    }

    const sessionId = `clean_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const session: CleanSession = {
      id: sessionId,
      name,
      phoneNumber,
      status: 'idle',
      createdAt: new Date(),
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    console.log(`✅ Session created: ${name} (${sessionId})`);
    
    return session;
  }

  async queueConnection(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Si ya hay una conexión activa, terminarla primero
    if (this.connections.size > 0) {
      console.log('🧹 Terminating existing connections before new one...');
      await this.terminateAllConnections();
      
      // Esperar para que WhatsApp libere recursos
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    session.status = 'connecting';
    this.sessions.set(sessionId, session);

    this.connectionQueue.push(sessionId);
    await this.processConnectionQueue();
  }

  private async connectSessionSafe(sessionId: string): Promise<void> {
    try {
      console.log(`🔗 Connecting session: ${sessionId}`);
      
      const session = this.sessions.get(sessionId);
      if (!session) throw new Error('Session not found');

      // Crear directorio de autenticación único
      const authDir = path.join(process.cwd(), 'sessions', sessionId);
      await fs.mkdir(authDir, { recursive: true });

      // SIGUIENDO DOCUMENTACIÓN OFICIAL: usar useMultiFileAuthState
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      // Browser fingerprint único y estable por sesión
      const browserFingerprint = this.generateStableBrowserFingerprint(sessionId);
      
      console.log(`🌐 Using browser: ${browserFingerprint.join(' ')}`);
      
      // SIGUIENDO DOCUMENTACIÓN: configuración mínima recomendada
      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: browserFingerprint,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
        getMessage: async () => ({ conversation: 'Hello' })
      });

      // Función de limpieza
      const cleanup = async () => {
        console.log(`🧹 Cleaning up session: ${sessionId}`);
        
        try {
          // Remover todos los event listeners ANTES de cerrar
          socket.ev.removeAllListeners();
          
          // Cerrar socket gracefully con timeout
          if (socket.ws?.readyState === 1) {
            console.log('🚪 Attempting graceful logout...');
            const logoutPromise = socket.logout();
            const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000));
            await Promise.race([logoutPromise, timeoutPromise]);
          }
          
          socket.end();
          
          // Esperar un poco antes de limpiar archivos
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Limpiar archivos de autenticación
          await fs.rm(authDir, { recursive: true, force: true });
          
        } catch (error) {
          console.warn(`Warning during cleanup: ${error.message}`);
        }
      };

      // Crear conexión activa ANTES de setup handlers
      const connection: ActiveConnection = {
        sessionId,
        socket,
        authDir,
        authState: state,
        saveCreds,
        isConnecting: true,
        cleanup
      };

      this.connections.set(sessionId, connection);

      // SIGUIENDO DOCUMENTACIÓN: setup event handlers primero
      this.setupSocketHandlers(sessionId, socket, saveCreds, session, connection);

      // SIGUIENDO DOCUMENTACIÓN: pairing code DESPUÉS de connection.update setup
      if (session.phoneNumber) {
        // Esperar un momento para que el socket se inicialice
        setTimeout(async () => {
          await this.generatePairingCode(sessionId, session.phoneNumber!, socket, connection);
        }, 1000);
      } else {
        // El QR se generará automáticamente en connection.update
        console.log('📱 Waiting for QR generation...');
      }

    } catch (error) {
      console.error(`❌ Error connecting session ${sessionId}:`, error);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'error';
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
      }
      
      // Limpiar conexión fallida
      await this.cleanupConnection(sessionId);
    }
  }

  private generateStableBrowserFingerprint(sessionId: string): [string, string, string] {
    // Generar fingerprint estable basado en sessionId
    const hash = sessionId.split('_')[1]; // timestamp part
    const browsers = [
      ['WhatsApp-Web', 'Chrome', `120.0.${hash.slice(-4)}.1`],
      ['Baileys-Client', 'Firefox', `119.0.${hash.slice(-4)}.2`],
      ['WA-Business', 'Safari', `17.1.${hash.slice(-4)}.3`],
      ['Multi-Device', 'Edge', `120.0.${hash.slice(-4)}.4`]
    ];
    
    const index = parseInt(hash.slice(-1), 36) % browsers.length;
    return browsers[index] as [string, string, string];
  }

  private async generatePairingCode(sessionId: string, phoneNumber: string, socket: WASocket, connection: ActiveConnection) {
    try {
      console.log(`📱 Generating pairing code for: ${phoneNumber}`);
      
      // SIGUIENDO DOCUMENTACIÓN: E.164 format sin el signo +
      const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
      console.log(`📞 Clean phone number: ${cleanPhone}`);
      
      if (cleanPhone.length < 10) {
        throw new Error('Invalid phone number format');
      }
      
      // SIGUIENDO DOCUMENTACIÓN: requestPairingCode durante la conexión
      const code = await socket.requestPairingCode(cleanPhone);
      
      console.log(`\n🔢 ============================`);
      console.log(`🔢 PAIRING CODE GENERATED`);
      console.log(`🔢 Session: ${sessionId}`);
      console.log(`🔢 Phone: ${phoneNumber}`);
      console.log(`🔢 Code: ${code}`);
      console.log(`🔢 ============================\n`);
      console.log(`📱 Enter this code in WhatsApp:`);
      console.log(`   1. Open WhatsApp on your phone`);
      console.log(`   2. Go to Settings > Linked Devices`);
      console.log(`   3. Tap 'Link a Device'`);
      console.log(`   4. Tap 'Link with Phone Number Instead'`);
      console.log(`   5. Enter the code: ${code}`);
      console.log(`\n⏰ Code expires in 60 seconds\n`);
      
      connection.pairingCode = code;
      
    } catch (error) {
      console.error(`❌ Error generating pairing code:`, error);
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'error';
        this.sessions.set(sessionId, session);
      }
    }
  }

  private setupSocketHandlers(sessionId: string, socket: WASocket, saveCreds: () => Promise<void>, session: CleanSession, connection: ActiveConnection) {
    // SIGUIENDO DOCUMENTACIÓN OFICIAL: manejar connection.update
    socket.ev.on('connection.update', async (update) => {
      const { connection: connState, lastDisconnect, qr } = update;
      
      console.log(`📡 Connection update [${sessionId}]:`, { 
        connection: connState, 
        hasQR: !!qr,
        hasError: !!lastDisconnect?.error
      });

      // SIGUIENDO DOCUMENTACIÓN: manejar QR code
      if (qr && !session.phoneNumber) {
        try {
          const qrString = await QRCode.toDataURL(qr);
          
          console.log(`\n📱 ===============================`);
          console.log(`📱 QR CODE FOR SESSION: ${sessionId}`);
          console.log(`📱 ===============================`);
          
          // Mostrar QR en terminal usando la biblioteca oficial
          console.log(await QRCode.toString(qr, { type: 'terminal', small: true }));
          
          console.log(`\n📱 Instructions:`);
          console.log(`   1. Open WhatsApp on your phone`);
          console.log(`   2. Go to Settings > Linked Devices`);
          console.log(`   3. Tap 'Link a Device'`);
          console.log(`   4. Scan the QR code above`);
          console.log(`\n⏰ QR expires in 60 seconds\n`);
          
          connection.qrData = qrString;
          
        } catch (error) {
          console.error(`Error generating QR display:`, error);
        }
      }

      // SIGUIENDO DOCUMENTACIÓN: manejar estados de conexión
      if (connState === 'open') {
        console.log(`✅ Session connected successfully: ${sessionId}`);
        
        session.status = 'connected';
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
        
        connection.isConnecting = false;
        
        // Limpiar datos temporales de autenticación
        connection.qrData = undefined;
        connection.pairingCode = undefined;
        
      } else if (connState === 'close') {
        // SIGUIENDO DOCUMENTACIÓN: analizar razón de desconexión
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message;
        
        console.log(`❌ Connection closed [${sessionId}]:`, { 
          statusCode, 
          error: errorMsg,
          reason: this.getDisconnectReason(statusCode) 
        });
        
        // SIGUIENDO DOCUMENTACIÓN: determinar si reconectar
        const shouldReconnect = this.shouldReconnect(statusCode);
        
        if (shouldReconnect) {
          session.status = 'disconnected';
          console.log(`🔄 Session ${sessionId} will attempt to reconnect`);
        } else {
          session.status = 'error';
          console.log(`🛑 Session ${sessionId} will not reconnect`);
        }
        
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
        
        connection.isConnecting = false;
        
        // Limpiar conexión
        await this.cleanupConnection(sessionId);
      } else if (connState === 'connecting') {
        console.log(`🔄 Session connecting: ${sessionId}`);
        session.status = 'connecting';
        session.lastActivity = new Date();
        this.sessions.set(sessionId, session);
      }
    });

    // SIGUIENDO DOCUMENTACIÓN: escuchar creds.update para guardar credenciales
    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        console.log(`💾 Credentials saved for session: ${sessionId}`);
      } catch (error) {
        console.error(`❌ Error saving credentials for ${sessionId}:`, error);
      }
    });
  }

  // SIGUIENDO DOCUMENTACIÓN: razones de desconexión específicas
  private shouldReconnect(statusCode?: number): boolean {
    if (!statusCode) return false;
    
    // Reconectar solo en casos específicos según documentación
    const reconnectCodes = [
      DisconnectReason.connectionClosed,
      DisconnectReason.connectionLost,
      DisconnectReason.restartRequired,
      DisconnectReason.timedOut
    ];
    
    return reconnectCodes.includes(statusCode);
  }

  private getDisconnectReason(statusCode?: number): string {
    if (!statusCode) return 'Unknown';
    
    const reasons = {
      [DisconnectReason.badSession]: 'Bad Session',
      [DisconnectReason.connectionClosed]: 'Connection Closed',
      [DisconnectReason.connectionLost]: 'Connection Lost',
      [DisconnectReason.connectionReplaced]: 'Connection Replaced',
      [DisconnectReason.loggedOut]: 'Logged Out',
      [DisconnectReason.restartRequired]: 'Restart Required',
      [DisconnectReason.timedOut]: 'Timed Out',
      [DisconnectReason.forbidden]: 'Forbidden',
      [DisconnectReason.unavailable]: 'Unavailable'
    };
    
    return reasons[statusCode] || `Unknown (${statusCode})`;
  }

  private async cleanupConnection(sessionId: string) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      await connection.cleanup();
      this.connections.delete(sessionId);
    }
  }

  private async terminateAllConnections() {
    const cleanupPromises = Array.from(this.connections.keys()).map(id => this.cleanupConnection(id));
    await Promise.all(cleanupPromises);
    this.connections.clear();
  }

  // API Methods
  getSessions(): CleanSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): CleanSession | undefined {
    return this.sessions.get(sessionId);
  }

  getConnection(sessionId: string): ActiveConnection | undefined {
    return this.connections.get(sessionId);
  }

  async deleteSession(sessionId: string) {
    await this.cleanupConnection(sessionId);
    this.sessions.delete(sessionId);
    console.log(`🗑️ Session deleted: ${sessionId}`);
  }

  async shutdown() {
    console.log('🛑 Shutting down session manager...');
    await this.terminateAllConnections();
    this.sessions.clear();
  }
}

// INSTANCIA ÚNICA
const sessionManager = new SessionManager();

// ENDPOINTS LIMPIOS
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    sessions: sessionManager.getSessions().length,
    connections: Array.from(sessionManager.getConnection as any).length
  });
});

app.post('/api/v1/sessions', async (req, res) => {
  try {
    const { sessionName, phoneNumber } = req.body;
    
    if (!sessionName || !/^[a-zA-Z0-9]+$/.test(sessionName)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid session name. Use only letters and numbers.' }
      });
    }

    const session = await sessionManager.createSession(sessionName, phoneNumber);
    res.json({ success: true, data: session });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

app.get('/api/v1/sessions', (req, res) => {
  res.json({
    success: true,
    data: sessionManager.getSessions()
  });
});

app.get('/api/v1/sessions/:sessionId', (req, res) => {
  const session = sessionManager.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found' }
    });
  }
  
  res.json({ success: true, data: session });
});

app.post('/api/v1/sessions/:sessionId/connect', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session not found' }
      });
    }

    await sessionManager.queueConnection(sessionId);
    
    res.json({
      success: true,
      data: {
        sessionId,
        status: 'connecting',
        message: session.phoneNumber ? 'Generating pairing code...' : 'Generating QR code...'
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

app.get('/api/v1/sessions/:sessionId/qr', (req, res) => {
  const connection = sessionManager.getConnection(req.params.sessionId);
  
  if (!connection?.qrData) {
    return res.status(404).json({
      success: false,
      error: { message: 'QR not available' }
    });
  }

  res.json({
    success: true,
    data: {
      sessionId: req.params.sessionId,
      qrCode: connection.qrData
    }
  });
});

app.get('/api/v1/sessions/:sessionId/pairing-code', (req, res) => {
  const connection = sessionManager.getConnection(req.params.sessionId);
  
  if (!connection?.pairingCode) {
    return res.status(404).json({
      success: false,
      error: { message: 'Pairing code not available' }
    });
  }

  res.json({
    success: true,
    data: {
      sessionId: req.params.sessionId,
      code: connection.pairingCode
    }
  });
});

app.post('/api/v1/sessions/:sessionId/send-message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, type, content } = req.body;
    
    const connection = sessionManager.getConnection(sessionId);
    const session = sessionManager.getSession(sessionId);
    
    if (!connection || session?.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: { message: 'Session not connected' }
      });
    }

    let result;
    if (type === 'text') {
      result = await connection.socket.sendMessage(`${to}@s.whatsapp.net`, { 
        text: content.text 
      });
    } else {
      throw new Error(`Message type ${type} not supported`);
    }

    res.json({
      success: true,
      data: { 
        messageId: result.key.id, 
        timestamp: new Date() 
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

app.delete('/api/v1/sessions/:sessionId', async (req, res) => {
  try {
    await sessionManager.deleteSession(req.params.sessionId);
    res.json({ success: true, message: 'Session deleted' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

app.post('/api/v1/system/reset', async (req, res) => {
  try {
    await sessionManager.shutdown();
    res.json({ success: true, message: 'System reset complete' });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Graceful shutdown...');
  await sessionManager.shutdown();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`🚀 Clean Baileys Server running on port ${port}`);
  console.log(`🌐 Health: http://localhost:${port}/health`);
  console.log(`📱 Ready for clean WhatsApp connections!`);
});