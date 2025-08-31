import express from 'express';
import cors from 'cors';
import { SessionManager } from './src/services/SessionManager';
import { SessionController } from './src/controllers/SessionController';
import { MemoryDatabase } from './src/database/MemoryDatabase';
import { MemoryRedis } from './src/redis/MemoryRedis';

const app = express();
const port = process.env.SESSION_MANAGER_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Servicios en memoria
const database = new MemoryDatabase();
const redisClient = new MemoryRedis();
const sessionManager = new SessionManager(database as any, redisClient as any);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date(),
    version: '1.0.0',
    services: {
      database: { status: 'healthy' },
      redis: { status: 'healthy' }
    }
  });
});

// Crear un router custom para evitar conflictos con el middleware del SessionController
const sessionRouter = express.Router();

// Middleware simple de autenticación para desarrollo
sessionRouter.use((req, res, next) => {
  req.user = {
    userId: 'test-user-id',
    apiKey: req.headers['x-api-key'] || 'test-api-key-12345',
    permissions: []
  };
  next();
});

// Crear versión simplificada de los endpoints
sessionRouter.post('/', async (req, res) => {
  try {
    const { sessionName, phoneNumber } = req.body;
    
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

    const session = await sessionManager.createSession('test-user-id', { sessionName, phoneNumber });
    res.status(201).json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.get('/', async (req, res) => {
  try {
    const sessions = await sessionManager.getUserSessions('test-user-id');
    res.json({ success: true, data: sessions });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.get('/:sessionId/status', async (req, res) => {
  try {
    const session = await sessionManager.getSessionById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', timestamp: new Date() }
      });
    }
    res.json({ success: true, data: session });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.post('/:sessionId/connect', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await sessionManager.getSessionById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: { code: 'SESSION_NOT_FOUND', message: 'Session not found', timestamp: new Date() }
      });
    }

    const authData = await sessionManager.connectSession(sessionId);
    res.json({ success: true, data: authData });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.get('/:sessionId/qr', async (req, res) => {
  try {
    const qrData = await sessionManager.getQRCode(req.params.sessionId);
    if (!qrData) {
      return res.status(404).json({
        success: false,
        error: { code: 'QR_NOT_FOUND', message: 'QR code not available', timestamp: new Date() }
      });
    }
    res.json({ success: true, data: qrData });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.post('/:sessionId/send-message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, type, content } = req.body;

    const socket = sessionManager.getSocket(sessionId);
    if (!socket) {
      return res.status(400).json({
        success: false,
        error: { code: 'SESSION_DISCONNECTED', message: 'Session is not connected', timestamp: new Date() }
      });
    }

    let result;
    if (type === 'text') {
      result = await socket.sendMessage(`${to}@s.whatsapp.net`, { text: content.text });
    } else {
      throw new Error(`Message type ${type} not implemented`);
    }

    res.json({
      success: true,
      data: { messageId: result.key.id, status: 'sent', timestamp: new Date() }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'MESSAGE_SEND_FAILED', message: error.message, timestamp: new Date() }
    });
  }
});

sessionRouter.delete('/:sessionId', async (req, res) => {
  try {
    await sessionManager.deleteSession(req.params.sessionId);
    res.json({ success: true, data: { message: 'Session deleted' } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: { code: 'ERROR', message: error.message, timestamp: new Date() }
    });
  }
});

app.use('/api/v1/sessions', sessionRouter);

// Error handler
app.use((error: any, req: any, res: any, next: any) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: error.message,
      timestamp: new Date()
    }
  });
});

// Iniciar servidor
async function start() {
  try {
    await database.connect();
    await redisClient.connect();
    
    app.listen(port, () => {
      console.log(`🚀 Session Manager corriendo en puerto ${port}`);
      console.log(`🌐 Health check: http://localhost:${port}/health`);
      console.log(`🧪 Abre test/whatsapp-test.html para probar`);
      console.log(`🔑 API Key: test-api-key-12345`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar:', error);
    process.exit(1);
  }
}

start();