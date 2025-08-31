#!/bin/bash
# Script de configuración inicial del VPS

echo "🚀 Configurando VPS para Setter WhatsApp..."

# 1. Actualizar sistema
echo "📦 Actualizando sistema..."
apt update && apt upgrade -y

# 2. Instalar dependencias básicas
echo "🔧 Instalando dependencias básicas..."
apt install -y curl wget git nano htop unzip software-properties-common

# 3. Instalar Node.js 18
echo "📦 Instalando Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# 4. Instalar Docker y Docker Compose
echo "🐳 Instalando Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker root

# Instalar Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 5. Configurar firewall
echo "🔥 Configurando firewall..."
ufw allow ssh
ufw allow 80
ufw allow 443
ufw allow 3001
ufw allow 8080
ufw --force enable

# 6. Crear directorio de aplicación
echo "📁 Creando estructura de directorios..."
mkdir -p /opt/setter-whatsapp
cd /opt/setter-whatsapp

# 7. Configurar swap (importante para VPS pequeños)
echo "💾 Configurando swap de 2GB..."
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# 8. Optimizar sistema para WhatsApp
echo "⚡ Optimizando sistema..."
echo 'vm.swappiness=10' >> /etc/sysctl.conf
echo 'fs.file-max=100000' >> /etc/sysctl.conf
sysctl -p

# 9. Instalar Nginx para SSL/Proxy
echo "🌐 Instalando Nginx..."
apt install -y nginx certbot python3-certbot-nginx

echo "✅ VPS configurado correctamente!"
echo "📋 Siguiente paso: Subir código de aplicación"