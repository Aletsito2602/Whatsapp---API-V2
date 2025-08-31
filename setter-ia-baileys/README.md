# Setter IA - Baileys 🚀

Multi-user WhatsApp API system using Baileys library with microservices architecture.

## Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Session Mgr    │  │  Message Gateway│  │  User Mgmt      │
│     Service     │  │     Service     │  │    Service      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Webhook        │  │  Media Service  │  │  Analytics      │
│    Service      │  │                 │  │    Service      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Services

- **Session Manager**: WhatsApp session management with Baileys
- **Message Gateway**: Message sending/receiving API
- **User Management**: User authentication and API keys
- **Webhook Service**: Event processing and webhooks
- **Media Service**: File handling and storage
- **Analytics Service**: Metrics and reporting

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install:all
   ```

2. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start with Docker:**
   ```bash
   npm run docker:up
   ```

4. **Or start in development:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Session Management
- `POST /api/v1/sessions/create` - Create new session
- `GET /api/v1/sessions/:sessionId/status` - Get session status
- `POST /api/v1/sessions/:sessionId/connect` - Connect session
- `DELETE /api/v1/sessions/:sessionId` - Delete session

### Message Operations
- `POST /api/v1/sessions/:sessionId/messages/send` - Send message
- `GET /api/v1/sessions/:sessionId/messages/history` - Get message history

## Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **WhatsApp**: Baileys library
- **Database**: PostgreSQL + Redis
- **Queue**: Bull Queue with Redis
- **Storage**: AWS S3 compatible
- **Container**: Docker + Kubernetes
- **Monitoring**: Prometheus + Grafana

## Development

```bash
# Install dependencies
npm run install:all

# Run in development mode
npm run dev

# Run tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build all services
npm run build
```

## Deployment

### Docker
```bash
npm run docker:build
npm run docker:up
```

### Kubernetes
```bash
npm run k8s:deploy
```

## License

MIT License - see LICENSE file for details.