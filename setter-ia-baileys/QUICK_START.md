# 🚀 Guía Rápida - Setter IA Baileys

Esta guía te ayudará a poner en funcionamiento el sistema WhatsApp API en 5 minutos.

## 📋 Requisitos Previos

- **Docker Desktop** instalado y corriendo
- **Node.js 18+** 
- **npm** o **yarn**
- Un navegador web moderno

## 🏃‍♂️ Inicio Rápido

### 1. Ejecutar el Script de Desarrollo

```bash
# Dar permisos de ejecución (solo la primera vez)
chmod +x scripts/start-dev.sh

# Iniciar servicios base
./scripts/start-dev.sh
```

Este script:
- ✅ Verifica Docker
- ✅ Crea archivo `.env`
- ✅ Instala dependencias
- ✅ Inicia PostgreSQL y Redis
- ✅ Inicializa la base de datos
- ✅ Abre la interfaz de prueba

### 2. Iniciar los Microservicios

```bash
# Opción 1: Con Docker (recomendado)
make docker-up

# Opción 2: Desarrollo local
npm run dev
```

### 3. Abrir la Interfaz de Prueba

Abre en tu navegador: `test/whatsapp-test.html`

O usa la URL directa: `file://TU_PATH/setter-ia-baileys/test/whatsapp-test.html`

## 🧪 Cómo Hacer la Prueba Completa

### Paso 1: Configurar la Interfaz
1. Abre `test/whatsapp-test.html`
2. Verifica que la URL base sea `http://localhost:3001`
3. Verifica que la API Key sea `test-api-key-12345`

### Paso 2: Crear Sesión
1. Ingresa un nombre para la sesión (ej: `mi-test`)
2. **Opcional**: Ingresa tu número de teléfono para código de emparejamiento
3. Haz clic en "Crear Sesión"

### Paso 3: Conectar WhatsApp
1. Selecciona la sesión creada
2. Haz clic en "Conectar Sesión"
3. **Opción A - Código QR**: Escanea con WhatsApp
4. **Opción B - Código de Emparejamiento**: Usa el código mostrado

#### Para Código QR:
- Ve a WhatsApp → ⚙️ Configuración → Dispositivos vinculados
- Toca "Vincular un dispositivo" 
- Escanea el código QR mostrado

#### Para Código de Emparejamiento:
- Ve a WhatsApp → ⚙️ Configuración → Dispositivos vinculados  
- Toca "Vincular un dispositivo"
- Selecciona "Vincular con número de teléfono"
- Ingresa el código mostrado

### Paso 4: Enviar Mensaje de Prueba
1. Ingresa un número de destino (solo números, 10-15 dígitos)
2. Escribe un mensaje de prueba
3. Haz clic en "Enviar Mensaje"
4. ¡Verifica que llegue al WhatsApp destino!

## 📊 URLs Útiles

| Servicio | URL | Credenciales |
|----------|-----|--------------|
| **Interfaz de Prueba** | `test/whatsapp-test.html` | - |
| **Session Manager** | http://localhost:3001 | API Key: `test-api-key-12345` |
| **Message Gateway** | http://localhost:3002 | API Key: `test-api-key-12345` |
| **PgAdmin** | http://localhost:8080 | admin@example.com / admin |
| **Redis Commander** | http://localhost:8081 | admin / secret |
| **Nginx** | http://localhost:80 | - |

## 🔧 Comandos Útiles

```bash
# Ver logs en tiempo real
make logs

# Ver logs específicos
make logs-session
make logs-messages

# Verificar estado de servicios
make health

# Reiniciar servicios
make docker-down
make docker-up

# Limpiar todo
make docker-clean
```

## 🐛 Resolución de Problemas

### Error: "Docker no está corriendo"
```bash
# Inicia Docker Desktop y espera a que esté listo
open -a Docker    # En macOS
```

### Error: "Puerto ya en uso"
```bash
# Verifica qué está usando el puerto
lsof -i :3001

# O cambia el puerto en .env
SESSION_MANAGER_PORT=3011
```

### Error: "Session not connected"
- Asegúrate de haber escaneado el QR o usado el código de emparejamiento
- Verifica el estado en la interfaz de prueba
- Revisa los logs: `make logs-session`

### Error: "API key is required"
- Verifica que uses `X-API-Key: test-api-key-12345` en las peticiones
- En la interfaz web, verifica el campo API Key

### Base de datos no responde
```bash
# Reiniciar PostgreSQL
docker-compose restart postgres

# Verificar estado
docker-compose exec postgres pg_isready -U postgres
```

## 📱 Ejemplo de Prueba Rápida

1. **Crear sesión**:
   ```
   Nombre: "prueba-rapida"
   Teléfono: (deja vacío para QR)
   ```

2. **Conectar**: Escanear QR con WhatsApp

3. **Enviar mensaje**:
   ```
   Destino: TU_NUMERO_SIN_+ (ej: 1234567890)
   Mensaje: "¡Hola! Este es un test desde Setter IA Baileys 🚀"
   ```

4. **Verificar**: El mensaje debe llegar a tu WhatsApp

## 🎯 Próximos Pasos

Una vez que tengas el sistema funcionando:

1. **Explora las APIs**: Revisa los endpoints en el código
2. **Personaliza**: Modifica el `.env` para tu configuración
3. **Escala**: Usa Kubernetes con los manifiestos en `k8s/`
4. **Integra**: Conecta tu aplicación usando las APIs REST

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs: `make logs`
2. Verifica el estado: `make health` 
3. Consulta la documentación en `README.md`
4. Ejecuta las pruebas: `./scripts/test-api.sh`

---

**🎉 ¡Listo! Ya tienes un sistema WhatsApp API multi-usuario funcionando.**