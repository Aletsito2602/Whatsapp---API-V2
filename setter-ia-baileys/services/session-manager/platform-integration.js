// Cliente JavaScript para integrar WhatsApp en tu plataforma

class SetterWhatsAppAPI {
    constructor(config) {
        this.baseURL = config.baseURL || 'https://whatsapp.tu-dominio.com';
        this.apiKey = config.apiKey; // Tu API Key de producción
        this.timeout = config.timeout || 30000;
    }

    // Helper para hacer requests
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
                ...options.headers
            },
            timeout: this.timeout,
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error?.message || 'API Error');
            }
            
            return data.data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // ========== GESTIÓN DE SESIONES ==========

    // 1. Crear sesión WhatsApp
    async createSession(sessionName, phoneNumber = null) {
        return await this.request('/api/v1/sessions', {
            method: 'POST',
            body: JSON.stringify({ sessionName, phoneNumber })
        });
    }

    // 2. Conectar sesión (genera QR)
    async connectSession(sessionId) {
        return await this.request(`/api/v1/sessions/${sessionId}/connect`, {
            method: 'POST'
        });
    }

    // 3. Obtener estado de sesión
    async getSessionStatus(sessionId) {
        return await this.request(`/api/v1/sessions/${sessionId}/status`);
    }

    // 4. Obtener QR Code
    async getQRCode(sessionId) {
        return await this.request(`/api/v1/sessions/${sessionId}/qr`);
    }

    // 5. Obtener código de emparejamiento
    async getPairingCode(sessionId) {
        return await this.request(`/api/v1/sessions/${sessionId}/pairing-code`);
    }

    // 6. Listar todas las sesiones
    async listSessions() {
        return await this.request('/api/v1/sessions');
    }

    // 7. Desconectar sesión
    async disconnectSession(sessionId) {
        return await this.request(`/api/v1/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    }

    // ========== ENVÍO DE MENSAJES ==========

    // 8. Enviar mensaje de texto
    async sendMessage(sessionId, to, text) {
        return await this.request(`/api/v1/sessions/${sessionId}/send-message`, {
            method: 'POST',
            body: JSON.stringify({
                to,
                type: 'text',
                content: { text }
            })
        });
    }

    // 9. Enviar imagen
    async sendImage(sessionId, to, imageUrl, caption = '') {
        return await this.request(`/api/v1/sessions/${sessionId}/send-message`, {
            method: 'POST',
            body: JSON.stringify({
                to,
                type: 'image',
                content: { url: imageUrl, caption }
            })
        });
    }

    // 10. Enviar documento
    async sendDocument(sessionId, to, documentUrl, fileName) {
        return await this.request(`/api/v1/sessions/${sessionId}/send-message`, {
            method: 'POST',
            body: JSON.stringify({
                to,
                type: 'document',
                content: { 
                    url: documentUrl, 
                    fileName,
                    mimetype: 'application/pdf'
                }
            })
        });
    }

    // ========== GESTIÓN DE AGENTES ==========

    // 11. Crear agente IA
    async createAgent(agentData) {
        return await this.request('/api/v1/agents', {
            method: 'POST',
            body: JSON.stringify(agentData)
        });
    }

    // 12. Listar agentes
    async listAgents(userId = null) {
        const params = userId ? `?user_id=${userId}` : '';
        return await this.request(`/api/v1/agents${params}`);
    }

    // 13. Actualizar agente
    async updateAgent(agentId, updates) {
        return await this.request(`/api/v1/agents/${agentId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    }

    // 14. Activar/Desactivar agente
    async toggleAgent(agentId, isActive) {
        return await this.updateAgent(agentId, { is_active: isActive });
    }

    // ========== MENSAJES RECIBIDOS ==========

    // 15. Obtener mensajes recibidos
    async getMessages(sessionId, limit = 50, offset = 0) {
        return await this.request(
            `/api/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`
        );
    }

    // 16. Descargar media de mensaje
    async downloadMedia(sessionId, messageId) {
        const response = await fetch(
            `${this.baseURL}/api/v1/sessions/${sessionId}/messages/${messageId}/media`,
            {
                headers: { 'X-API-Key': this.apiKey }
            }
        );
        return response.blob();
    }

    // ========== MONITOREO ==========

    // 17. Health check
    async healthCheck() {
        return await this.request('/health');
    }

    // 18. Estadísticas del sistema
    async getStats() {
        return await this.request('/api/v1/stats');
    }

    // ========== WEBHOOKS (Para notificaciones en tiempo real) ==========

    // 19. Configurar webhook para mensajes
    async setupWebhook(webhookUrl) {
        return await this.request('/api/v1/webhook', {
            method: 'POST',
            body: JSON.stringify({ url: webhookUrl })
        });
    }
}

// ========== EJEMPLOS DE USO EN TU PLATAFORMA ==========

class TuPlataformaIntegration {
    constructor() {
        this.whatsapp = new SetterWhatsAppAPI({
            baseURL: 'https://whatsapp.tu-dominio.com',
            apiKey: 'sk-setter-prod-tu-api-key-aqui'
        });
    }

    // Ejemplo: Conectar WhatsApp para un cliente
    async conectarWhatsAppCliente(clienteId) {
        try {
            // 1. Crear sesión única por cliente
            const sessionName = `cliente_${clienteId}`;
            const session = await this.whatsapp.createSession(sessionName);
            
            // 2. Conectar para generar QR
            await this.whatsapp.connectSession(session.id);
            
            // 3. Obtener QR para mostrar al cliente
            const qrData = await this.whatsapp.getQRCode(session.id);
            
            // 4. Guardar en tu base de datos
            await this.guardarSesionCliente(clienteId, session.id);
            
            return {
                sessionId: session.id,
                qrCode: qrData.qr,
                status: 'waiting_scan'
            };
            
        } catch (error) {
            console.error('Error conectando WhatsApp:', error);
            throw error;
        }
    }

    // Ejemplo: Crear agente personalizado para cliente
    async crearAgenteCliente(clienteId, agenteConfig) {
        const agentData = {
            name: agenteConfig.nombre,
            description: agenteConfig.descripcion,
            is_active: true,
            user_id: clienteId,
            config: {
                persona: {
                    instructions: agenteConfig.prompt
                },
                automation: {
                    actionTriggers: agenteConfig.triggers.map(trigger => ({
                        type: 'contains',
                        keyword: trigger,
                        priority: 5
                    }))
                }
            }
        };

        return await this.whatsapp.createAgent(agentData);
    }

    // Ejemplo: Enviar mensaje desde tu plataforma
    async enviarMensajeDesdePanel(sessionId, destinatario, mensaje) {
        return await this.whatsapp.sendMessage(sessionId, destinatario, mensaje);
    }

    // Ejemplo: Obtener estadísticas para dashboard
    async obtenerEstadisticasCliente(sessionId) {
        const [status, messages, stats] = await Promise.all([
            this.whatsapp.getSessionStatus(sessionId),
            this.whatsapp.getMessages(sessionId, 20),
            this.whatsapp.getStats()
        ]);

        return {
            conexion: status,
            ultimosMensajes: messages.messages,
            estadisticasGenerales: stats
        };
    }
}

// Exportar para usar en tu aplicación
export { SetterWhatsAppAPI, TuPlataformaIntegration };