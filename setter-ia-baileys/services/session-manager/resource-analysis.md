# 📊 Análisis de Consumo de Recursos - Baileys WhatsApp

## 🔢 **Recursos por Sesión Activa**

### **Memoria RAM:**
- **Base por sesión:** 15-30 MB
- **Pico durante conexión:** 40-50 MB
- **Con historial de mensajes:** +10-20 MB
- **Con media cache:** +50-100 MB

### **CPU:**
- **Estado inactivo:** 0.1-0.5% por sesión
- **Durante mensajes:** 1-3% por sesión
- **Durante reconexión:** 5-10% temporal
- **Generación QR:** 2-5% temporal

### **Storage:**
- **Archivos de auth:** 2-5 KB por sesión
- **Credenciales cifradas:** 1-3 KB
- **Pre-keys y sessions:** 5-15 KB
- **Cache de mensajes:** 1-10 MB (opcional)

### **Red:**
- **Conexión WebSocket:** ~1-2 KB/s idle
- **Mensajes activos:** 5-50 KB/s
- **Media (imágenes/videos):** Según uso
- **Keep-alive:** 100 bytes cada 30s

---

## 🖥️ **Capacidad del VPS por Configuración**

### **VPS 1 CPU / 1GB RAM (Básico - $5-10/mes)**
```bash
Sesiones concurrentes: 10-15 máximo
Memoria disponible: ~700MB después del OS
CPU utilizable: 80% máximo
Recomendado: 8-10 sesiones para estabilidad

Configuración sugerida:
- MAX_SESSIONS=10
- SESSION_TIMEOUT=30min
- CLEANUP_INTERVAL=5min
- MEMORY_LIMIT=800MB
```

### **VPS 2 CPU / 2GB RAM (Estándar - $15-25/mes)**
```bash
Sesiones concurrentes: 25-40 máximo
Memoria disponible: ~1.5GB después del OS
CPU utilizable: 160% máximo
Recomendado: 30-35 sesiones para estabilidad

Configuración sugerida:
- MAX_SESSIONS=35
- SESSION_TIMEOUT=45min
- CLEANUP_INTERVAL=3min
- MEMORY_LIMIT=1.5GB
```

### **VPS 4 CPU / 4GB RAM (Profesional - $30-50/mes)**
```bash
Sesiones concurrentes: 60-100 máximo
Memoria disponible: ~3.2GB después del OS
CPU utilizable: 320% máximo
Recomendado: 80-90 sesiones para estabilidad

Configuración sugerida:
- MAX_SESSIONS=90
- SESSION_TIMEOUT=60min
- CLEANUP_INTERVAL=2min
- MEMORY_LIMIT=3GB
```

### **VPS 8 CPU / 8GB RAM (Enterprise - $60-100/mes)**
```bash
Sesiones concurrentes: 150-250 máximo
Memoria disponible: ~7GB después del OS
CPU utilizable: 640% máximo
Recomendado: 200+ sesiones

Configuración sugerida:
- MAX_SESSIONS=200
- SESSION_TIMEOUT=90min
- CLEANUP_INTERVAL=1min
- MEMORY_LIMIT=6.5GB
```

---

## ⚡ **Optimizaciones de Performance**

### **Configuración Optimizada para Producción:**
```javascript
const optimizedConfig = {
    // Limitar historial de mensajes en memoria
    getMessage: async (key) => {
        // Solo mantener últimos 100 mensajes por chat
        return limitedMessageStore.get(key.id);
    },
    
    // Configuración de conexión eficiente
    connectTimeoutMs: 30000,        // Reducir timeout
    defaultQueryTimeoutMs: 45000,   // Reducir timeout por defecto
    keepAliveIntervalMs: 25000,     // Keep-alive más frecuente
    
    // Optimizar browser signature
    browser: ['Bot', 'Server', '1.0'],  // Más corto = menos bandwidth
    
    // Configuración de auth state optimizada
    auth: {
        // Usar cache en memoria para auth state frecuente
        cacheMs: 300000  // 5 minutos
    },
    
    // Desactivar funciones innecesarias
    syncFullHistory: false,         // No sincronizar historial completo
    markOnlineOnConnect: false,     // No marcar online automáticamente
    fireInitQueries: false,         // No ejecutar queries iniciales
    generateHighQualityLinkPreview: false  // Desactivar previews
};
```

### **Gestión de Memoria Avanzada:**
```javascript
class MemoryOptimizedManager {
    constructor() {
        this.sessions = new Map();
        this.memoryThreshold = 80; // 80% de uso máximo
        this.cleanupInterval = setInterval(() => {
            this.performMemoryCleanup();
        }, 60000); // Cada minuto
    }
    
    async performMemoryCleanup() {
        const usage = process.memoryUsage();
        const usagePercent = (usage.heapUsed / usage.heapTotal) * 100;
        
        if (usagePercent > this.memoryThreshold) {
            console.log(`🧹 Memoria alta (${usagePercent.toFixed(1)}%), limpiando...`);
            
            // 1. Limpiar sesiones inactivas más agresivamente
            await this.cleanupInactiveSessions(15 * 60 * 1000); // 15 min
            
            // 2. Forzar garbage collection si está disponible
            if (global.gc) {
                global.gc();
            }
            
            // 3. Limpiar caches de mensajes
            this.clearMessageCaches();
            
            // 4. Si aún es alta, desconectar sesiones menos activas
            if (usagePercent > 90) {
                await this.emergencySessionCleanup();
            }
        }
    }
    
    getResourceStats() {
        const usage = process.memoryUsage();
        return {
            totalSessions: this.sessions.size,
            memoryUsage: {
                rss: Math.round(usage.rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(usage.external / 1024 / 1024) + 'MB',
                usagePercent: ((usage.heapUsed / usage.heapTotal) * 100).toFixed(1) + '%'
            },
            avgMemoryPerSession: Math.round(usage.heapUsed / this.sessions.size / 1024 / 1024) + 'MB'
        };
    }
}
```

---

## 📈 **Monitoreo en Tiempo Real**

### **Script de Monitoreo:**
```bash
#!/bin/bash
# monitor-resources.sh

echo "📊 Monitoreo de Recursos WhatsApp Bot"
echo "===================================="

while true; do
    # Memoria del proceso
    MEMORY=$(ps aux | grep "tsx simple-baileys.ts" | grep -v grep | awk '{print $6}')
    MEMORY_MB=$((MEMORY / 1024))
    
    # CPU del proceso
    CPU=$(ps aux | grep "tsx simple-baileys.ts" | grep -v grep | awk '{print $3}')
    
    # Conexiones activas
    CONNECTIONS=$(netstat -an | grep :3001 | grep ESTABLISHED | wc -l)
    
    # Disk usage de sesiones
    SESSIONS_SIZE=$(du -sh sessions/ 2>/dev/null | cut -f1)
    
    echo "$(date): RAM: ${MEMORY_MB}MB | CPU: ${CPU}% | Connections: ${CONNECTIONS} | Sessions: ${SESSIONS_SIZE}"
    
    # Alertas
    if [ "$MEMORY_MB" -gt 1000 ]; then
        echo "⚠️  ALERTA: Uso de memoria alto (${MEMORY_MB}MB)"
    fi
    
    if [ "$CONNECTIONS" -gt 50 ]; then
        echo "⚠️  ALERTA: Muchas conexiones activas (${CONNECTIONS})"
    fi
    
    sleep 30
done
```

---

## 🚨 **Límites y Alertas Recomendadas**

### **Configuración de Alertas:**
```javascript
const RESOURCE_LIMITS = {
    MAX_SESSIONS_PER_GB: 30,        // 30 sesiones por GB de RAM
    MAX_CPU_PERCENT: 80,            // 80% CPU máximo
    MAX_MEMORY_PERCENT: 85,         // 85% RAM máximo
    MAX_DISK_PER_SESSION: '10MB',   // 10MB por sesión máximo
    
    ALERTS: {
        HIGH_MEMORY: 70,            // Alerta a 70% RAM
        HIGH_CPU: 60,               // Alerta a 60% CPU
        INACTIVE_SESSION: 1800000,  // 30 min sin actividad
        FAILED_RECONNECTS: 3        // 3 intentos fallidos
    }
};
```

---

## 💡 **Recomendaciones por Escala**

### **Pequeña Escala (1-20 sesiones)**
- VPS: 2 CPU / 2GB RAM
- Costo: $15-25/mes
- Monitoreo: Básico con logs
- Backup: Diario

### **Mediana Escala (20-100 sesiones)**
- VPS: 4 CPU / 4GB RAM
- Costo: $30-50/mes
- Monitoreo: Grafana + Prometheus
- Backup: Cada 6 horas
- Load Balancer: Recomendado

### **Gran Escala (100+ sesiones)**
- Cluster: Múltiples servidores
- Costo: $100+/mes
- Monitoreo: Suite completa
- Backup: Continuo
- Auto-scaling: Esencial

---

## 🔧 **Comando de Diagnóstico Rápido**

```bash
# Diagnóstico completo del sistema
curl -H "X-API-Key: tu-api-key" http://localhost:3001/api/v1/stats

# Respuesta esperada:
{
  "success": true,
  "data": {
    "totalSessions": 25,
    "connectedSessions": 23,
    "memory": {
      "used": "650MB",
      "total": "2GB",
      "percentage": "32.5%"
    },
    "cpu": {
      "usage": "15.3%",
      "load": [0.85, 0.92, 1.05]
    },
    "disk": {
      "sessions": "125MB",
      "logs": "45MB"
    }
  }
}
```

**En resumen:** Cada sesión consume ~20-30MB RAM y 0.1-0.5% CPU en idle. Un VPS de 2GB puede manejar 30-40 sesiones cómodamente.