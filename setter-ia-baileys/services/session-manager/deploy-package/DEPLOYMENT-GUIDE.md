# 🚀 Guía de Despliegue a Producción

## 📋 Preparativos Necesarios

### **1. Servidor/VPS Requisitos:**
- **CPU:** Mínimo 2 cores
- **RAM:** Mínimo 2GB (recomendado 4GB)
- **Storage:** Mínimo 20GB SSD
- **OS:** Ubuntu 20.04+ / CentOS 8+ / Debian 11+
- **Docker:** Versión 20.10+
- **Docker Compose:** Versión 2.0+

### **2. Dominio y SSL:**
- Dominio registrado (ej: `whatsapp.tu-empresa.com`)
- Certificado SSL (Let's Encrypt gratuito)
- DNS configurado apuntando a tu servidor

### **3. Servicios Externos:**
- **Supabase:** Proyecto configurado
- **Gemini AI:** API Key de Google
- **Opcional:** Servicio de monitoreo

---

## 🛠️ **Paso a Paso**

### **Paso 1: Preparar el Servidor**

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reiniciar sesión para aplicar grupos
exit
```

### **Paso 2: Clonar y Configurar**

```bash
# Crear directorio de producción
mkdir -p /opt/setter-whatsapp
cd /opt/setter-whatsapp

# Subir archivos del proyecto
# (via git, scp, rsync, etc.)
```

### **Paso 3: Configurar Variables de Entorno**

```bash
# Editar .env.production
nano .env.production
```

**Configuración crítica:**
```bash
NODE_ENV=production
PORT=3001

# Supabase (TUS DATOS REALES)
SUPABASE_URL=https://bqitfhvaejxcyvjszfom.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Gemini AI (CLAVE REAL)
VITE_GEMINI_API_KEY=AIza...

# API Key de producción (GENERAR NUEVA)
SETTER_API_KEY=sk-setter-prod-$(openssl rand -hex 32)

# CORS para tu dominio
ALLOWED_ORIGINS=https://whatsapp.tu-empresa.com
```

### **Paso 4: Configurar SSL (Let's Encrypt)**

```bash
# Instalar Certbot
sudo apt install certbot

# Obtener certificado
sudo certbot certonly --standalone -d whatsapp.tu-empresa.com

# Copiar certificados para Nginx
sudo mkdir -p /opt/setter-whatsapp/ssl
sudo cp /etc/letsencrypt/live/whatsapp.tu-empresa.com/fullchain.pem /opt/setter-whatsapp/ssl/cert.pem
sudo cp /etc/letsencrypt/live/whatsapp.tu-empresa.com/privkey.pem /opt/setter-whatsapp/ssl/key.pem
sudo chown -R $USER:$USER /opt/setter-whatsapp/ssl
```

### **Paso 5: Actualizar Configuración**

```bash
# Editar nginx.conf - cambiar "tu-dominio.com" por tu dominio real
sed -i 's/tu-dominio.com/whatsapp.tu-empresa.com/g' nginx.conf
```

### **Paso 6: Desplegar**

```bash
# Ejecutar script de despliegue
./deploy.sh
```

---

## 🏗️ **Opciones de Despliegue**

### **Opción A: VPS Simple (Recomendado para empezar)**
- DigitalOcean Droplet $20/mes
- AWS Lightsail $20/mes  
- Linode $20/mes

### **Opción B: Cloud Providers**
- **AWS ECS/Fargate**
- **Google Cloud Run**
- **Azure Container Instances**

### **Opción C: Kubernetes (Avanzado)**
- EKS, GKE, AKS
- Para múltiples instancias/alta disponibilidad

---

## 📊 **Monitoreo y Mantenimiento**

### **Logs en Tiempo Real:**
```bash
# Ver logs del servicio
docker-compose -f docker-compose.production.yml logs -f setter-whatsapp

# Ver logs específicos
docker-compose -f docker-compose.production.yml logs --tail=100 setter-whatsapp
```

### **Comandos Útiles:**
```bash
# Reiniciar servicio
docker-compose -f docker-compose.production.yml restart

# Ver estado
docker-compose -f docker-compose.production.yml ps

# Actualizar código
git pull && ./deploy.sh

# Backup de sesiones
tar -czf backup-sessions-$(date +%Y%m%d).tar.gz -C /var/lib/docker/volumes sessions/
```

### **Monitoreo de Salud:**
```bash
# Script de monitoreo (agregar a cron)
*/5 * * * * curl -f http://localhost:3001/health || systemctl restart docker
```

---

## 🔒 **Seguridad**

### **Firewall:**
```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### **Actualizaciones Automáticas:**
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### **Backup Automático:**
```bash
# Script de backup diario
0 2 * * * /opt/setter-whatsapp/backup.sh
```

---

## 🚨 **Troubleshooting**

### **Problema: QR No Genera**
```bash
# Verificar logs
docker logs setter-whatsapp_setter-whatsapp_1

# Reiniciar contenedor
docker-compose restart setter-whatsapp
```

### **Problema: No Responde Mensajes**
```bash
# Verificar conexión Supabase
curl -H "X-API-Key: tu-api-key" http://localhost:3001/health

# Verificar logs de Gemini
docker logs setter-whatsapp_setter-whatsapp_1 | grep -i gemini
```

### **Problema: Alto Uso de Memoria**
```bash
# Verificar recursos
docker stats

# Reiniciar si es necesario
docker-compose restart
```

---

## 📞 **URLs de Producción**

Una vez desplegado:

- **🌐 Interfaz Web:** `https://whatsapp.tu-empresa.com/`
- **📱 API WhatsApp:** `https://whatsapp.tu-empresa.com/api/v1/`
- **🩺 Health Check:** `https://whatsapp.tu-empresa.com/health`
- **📊 Stats:** `https://whatsapp.tu-empresa.com/api/v1/stats`

---

## ✅ **Checklist Final**

- [ ] ✅ Servidor configurado con Docker
- [ ] ✅ Dominio apuntando al servidor
- [ ] ✅ SSL configurado
- [ ] ✅ Variables de entorno de producción
- [ ] ✅ Firewall configurado
- [ ] ✅ Servicio desplegado y healthy
- [ ] ✅ QR generado y WhatsApp conectado
- [ ] ✅ Prueba de trigger funcionando
- [ ] ✅ Monitoreo configurado
- [ ] ✅ Backups programados

¡Tu sistema WhatsApp IA está listo para producción! 🎉