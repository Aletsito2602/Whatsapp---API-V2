import { logger } from '../utils/logger';

// Base de datos en memoria simple para desarrollo
export class MemoryDatabase {
  private users = new Map();
  private sessions = new Map();
  private messages = new Map();

  async connect(): Promise<void> {
    logger.info('Memory Database connected');
    
    // Crear usuario de prueba
    const testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      api_key: 'test-api-key-12345',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    this.users.set(testUser.id, testUser);
  }

  async disconnect(): Promise<void> {
    logger.info('Memory Database disconnected');
  }

  async query(sql: string, params: any[] = []): Promise<any> {
    logger.debug(`Query: ${sql}`, { params });
    
    // Simulador básico de queries
    if (sql.includes('INSERT INTO whatsapp_sessions')) {
      const [id, user_id, session_name, phone_number, status] = params;
      const session = {
        id,
        user_id,
        session_name,
        phone_number,
        status,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.sessions.set(id, session);
      return { rows: [], count: 1, affectedRows: 1 };
    }
    
    if (sql.includes('SELECT * FROM whatsapp_sessions WHERE id')) {
      const sessionId = params[0];
      const session = this.sessions.get(sessionId);
      return { rows: session ? [session] : [], count: session ? 1 : 0 };
    }
    
    if (sql.includes('SELECT * FROM whatsapp_sessions WHERE user_id')) {
      const userId = params[0];
      const userSessions = Array.from(this.sessions.values())
        .filter(s => s.user_id === userId);
      return { rows: userSessions, count: userSessions.length };
    }
    
    if (sql.includes('UPDATE whatsapp_sessions')) {
      const sessionId = params[params.length - 1];
      const session = this.sessions.get(sessionId);
      if (session) {
        if (sql.includes('status =')) {
          session.status = params[0];
          session.last_seen = new Date();
        }
        if (sql.includes('phone_number =')) {
          session.phone_number = params[0];
        }
        session.updated_at = new Date();
        this.sessions.set(sessionId, session);
      }
      return { rows: [], count: 1, affectedRows: 1 };
    }
    
    if (sql.includes('DELETE FROM whatsapp_sessions')) {
      const sessionId = params[0];
      this.sessions.delete(sessionId);
      return { rows: [], count: 1, affectedRows: 1 };
    }
    
    // Default
    return { rows: [], count: 0, affectedRows: 0 };
  }

  async transaction(): Promise<any> {
    return {
      id: 'memory-transaction',
      query: this.query.bind(this),
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve()
    };
  }

  get connected(): boolean {
    return true;
  }
}