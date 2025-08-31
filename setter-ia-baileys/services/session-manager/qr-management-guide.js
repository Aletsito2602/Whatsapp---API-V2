// Guía completa de gestión de QR y sesiones con Baileys

class QRSessionManager {
    constructor() {
        this.sessions = new Map();
        this.qrTimers = new Map();
        this.reconnectAttempts = new Map();
    }

    // 1. GENERACIÓN DE QR - Método principal
    async generateQR(sessionId, phoneNumber = null) {
        console.log(`🔄 Generando QR para sesión: ${sessionId}`);
        
        try {
            const { state, saveCreds } = await useMultiFileAuthState(`sessions/${sessionId}`);
            
            const sock = makeWASocket({
                auth: state,
                browser: [`Setter-${sessionId}`, 'Chrome', '1.0.0'],
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000,
                printQRInTerminal: true, // Para desarrollo
                // Para código de emparejamiento en lugar de QR:
                // generateHighQualityLinkPreview: false,
                // mobile: false
            });

            this.sessions.set(sessionId, {
                socket: sock,
                state: 'connecting',
                createdAt: Date.now(),
                lastActivity: Date.now(),
                phoneNumber
            });

            // Handler para actualización de conexión
            sock.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(sessionId, update);
            });

            // Handler para guardar credenciales
            sock.ev.on('creds.update', saveCreds);

            // Handler para mensajes (auto-respuesta)
            sock.ev.on('messages.upsert', (m) => {
                this.handleMessages(sessionId, m);
            });

            // TIMEOUT del QR (60 segundos)
            const qrTimer = setTimeout(() => {
                if (this.sessions.get(sessionId)?.state === 'connecting') {
                    console.log(`⏰ QR expirado para ${sessionId}`);
                    this.cleanupSession(sessionId);
                }
            }, 60000);

            this.qrTimers.set(sessionId, qrTimer);

            return sock;

        } catch (error) {
            console.error(`❌ Error generando QR para ${sessionId}:`, error);
            throw error;
        }
    }

    // 2. MANEJO DE ACTUALIZACIONES DE CONEXIÓN
    async handleConnectionUpdate(sessionId, update) {
        const { connection, lastDisconnect, qr } = update;
        const sessionData = this.sessions.get(sessionId);

        if (qr) {
            console.log(`📱 Nuevo QR generado para ${sessionId}`);
            sessionData.qr = qr;
            sessionData.qrGeneratedAt = Date.now();
            // Aquí puedes enviar el QR al frontend
            this.notifyQRUpdate(sessionId, qr);
        }

        if (connection === 'close') {
            const shouldReconnect = this.shouldReconnect(sessionId, lastDisconnect);
            
            if (shouldReconnect) {
                console.log(`🔄 Reconectando ${sessionId}...`);
                await this.attemptReconnection(sessionId);
            } else {
                console.log(`❌ Sesión ${sessionId} terminada permanentemente`);
                await this.cleanupSession(sessionId);
            }

        } else if (connection === 'connecting') {
            console.log(`🔗 Conectando ${sessionId}...`);
            sessionData.state = 'connecting';

        } else if (connection === 'open') {
            console.log(`✅ ${sessionId} conectado exitosamente`);
            sessionData.state = 'connected';
            sessionData.connectedAt = Date.now();
            
            // Limpiar timer del QR
            const qrTimer = this.qrTimers.get(sessionId);
            if (qrTimer) {
                clearTimeout(qrTimer);
                this.qrTimers.delete(sessionId);
            }
            
            // Reset intentos de reconexión
            this.reconnectAttempts.delete(sessionId);
        }

        sessionData.lastActivity = Date.now();
    }

    // 3. LÓGICA DE RECONEXIÓN INTELIGENTE
    shouldReconnect(sessionId, lastDisconnect) {
        const { error } = lastDisconnect || {};
        const statusCode = error?.output?.statusCode;

        // Códigos que NO requieren reconexión
        const noReconnectCodes = [
            DisconnectReason.loggedOut,      // 401 - Usuario cerró sesión
            DisconnectReason.badSession,     // 401 - Sesión inválida
            DisconnectReason.connectionReplaced, // 440 - Otra conexión activa
        ];

        if (noReconnectCodes.includes(statusCode)) {
            return false;
        }

        // Limitar intentos de reconexión
        const attempts = this.reconnectAttempts.get(sessionId) || 0;
        if (attempts >= 5) {
            console.log(`❌ Máximo de reconexiones alcanzado para ${sessionId}`);
            return false;
        }

        return true;
    }

    // 4. RECONEXIÓN CON BACKOFF EXPONENCIAL
    async attemptReconnection(sessionId) {
        const attempts = this.reconnectAttempts.get(sessionId) || 0;
        this.reconnectAttempts.set(sessionId, attempts + 1);

        // Backoff exponencial: 2^attempts segundos
        const delay = Math.pow(2, attempts) * 1000;
        
        setTimeout(async () => {
            try {
                await this.generateQR(sessionId);
            } catch (error) {
                console.error(`❌ Error en reconexión ${sessionId}:`, error);
            }
        }, delay);
    }

    // 5. CÓDIGO DE EMPAREJAMIENTO (Alternativa al QR)
    async generatePairingCode(sessionId, phoneNumber) {
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            throw new Error('Sesión no encontrada');
        }

        try {
            // phoneNumber debe estar en formato: 5491234567890 (sin +)
            const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
            const pairingCode = await sessionData.socket.requestPairingCode(cleanNumber);
            
            console.log(`🔢 Código de emparejamiento para ${sessionId}: ${pairingCode}`);
            return pairingCode;

        } catch (error) {
            console.error(`❌ Error generando código para ${sessionId}:`, error);
            throw error;
        }
    }

    // 6. LIMPIEZA COMPLETA DE SESIÓN
    async cleanupSession(sessionId) {
        console.log(`🧹 Limpiando sesión ${sessionId}...`);

        const sessionData = this.sessions.get(sessionId);
        
        try {
            // 1. Cerrar WebSocket
            if (sessionData?.socket) {
                sessionData.socket.end(new Error('Session cleanup'));
            }

            // 2. Limpiar timers
            const qrTimer = this.qrTimers.get(sessionId);
            if (qrTimer) {
                clearTimeout(qrTimer);
                this.qrTimers.delete(sessionId);
            }

            // 3. Eliminar archivos de autenticación
            const sessionDir = `sessions/${sessionId}`;
            await fs.rm(sessionDir, { recursive: true, force: true });

            // 4. Limpiar memoria
            this.sessions.delete(sessionId);
            this.reconnectAttempts.delete(sessionId);

            console.log(`✅ Sesión ${sessionId} limpiada correctamente`);

        } catch (error) {
            console.error(`❌ Error limpiando ${sessionId}:`, error);
        }
    }

    // 7. DESCONECTAR SESIÓN ACTIVA
    async disconnectSession(sessionId) {
        console.log(`🔌 Desconectando sesión ${sessionId}...`);
        
        const sessionData = this.sessions.get(sessionId);
        if (!sessionData) {
            throw new Error('Sesión no encontrada');
        }

        try {
            // Cerrar conexión limpiamente
            if (sessionData.socket) {
                await sessionData.socket.logout();
            }
        } catch (error) {
            console.log(`⚠️ Error en logout limpio: ${error.message}`);
        }

        // Limpiar completamente
        await this.cleanupSession(sessionId);
    }

    // 8. MANEJO DE MENSAJES ENTRANTES
    async handleMessages(sessionId, { messages, type }) {
        if (type !== 'notify') return;

        const sessionData = this.sessions.get(sessionId);
        if (!sessionData || sessionData.state !== 'connected') return;

        // Actualizar última actividad
        sessionData.lastActivity = Date.now();

        for (const message of messages) {
            if (message.key.fromMe) continue; // Ignorar mensajes propios

            const messageText = message.message?.conversation || 
                              message.message?.extendedTextMessage?.text || '';
            
            if (messageText) {
                console.log(`📨 Mensaje en ${sessionId}: ${messageText}`);
                // Aquí va la lógica de auto-respuesta con Supabase
                await this.processAutoResponse(sessionId, message, messageText);
            }
        }
    }

    // 9. OBTENER ESTADO DE TODAS LAS SESIONES
    getSessionsStatus() {
        const sessions = [];
        
        for (const [sessionId, data] of this.sessions.entries()) {
            sessions.push({
                sessionId,
                state: data.state,
                phoneNumber: data.phoneNumber,
                createdAt: data.createdAt,
                connectedAt: data.connectedAt,
                lastActivity: data.lastActivity,
                hasQR: !!data.qr,
                reconnectAttempts: this.reconnectAttempts.get(sessionId) || 0
            });
        }

        return sessions;
    }

    // 10. LIMPIEZA AUTOMÁTICA DE SESIONES INACTIVAS
    startCleanupScheduler() {
        setInterval(() => {
            this.performCleanup();
        }, 5 * 60 * 1000); // Cada 5 minutos
    }

    async performCleanup() {
        const now = Date.now();
        const INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutos

        for (const [sessionId, data] of this.sessions.entries()) {
            // Limpiar sesiones inactivas
            if (now - data.lastActivity > INACTIVE_TIMEOUT) {
                console.log(`🧹 Limpiando sesión inactiva: ${sessionId}`);
                await this.cleanupSession(sessionId);
            }
            
            // Limpiar sesiones que no se conectaron
            if (data.state === 'connecting' && now - data.createdAt > 10 * 60 * 1000) {
                console.log(`🧹 Limpiando sesión no conectada: ${sessionId}`);
                await this.cleanupSession(sessionId);
            }
        }
    }
}

// Exportar para usar en tu aplicación
module.exports = QRSessionManager;