 🚀 Comandos para activar el servidor:

  1. Servidor principal (API WhatsApp + Supabase):

  cd "/Users/alejandrovilte/Documents/TRIBE - NUEVA VERSION/nuevo setter/setter-ia-baileys/services/session-manager"
  npx tsx simple-baileys.ts

  2. Servidor web (Interfaz HTML):

  cd "/Users/alejandrovilte/Documents/TRIBE - NUEVA VERSION/nuevo setter/setter-ia-baileys/services/session-manager"
  node server-web.js

  3. Ambos en background:

  cd "/Users/alejandrovilte/Documents/TRIBE - NUEVA VERSION/nuevo setter/setter-ia-baileys/services/session-manager"

  # Servidor API en background
  nohup npx tsx simple-baileys.ts > server.log 2>&1 &

  # Servidor web en background  
  nohup node server-web.js > web-server.log 2>&1 &

  4. Para ver los logs en tiempo real:

  # Ver logs del servidor API
  tail -f server.log

  # Ver logs del servidor web
  tail -f web-server.log

  5. Para verificar que están corriendo:

  # Verificar puertos activos
  lsof -i :3001  # Servidor API
  lsof -i :8080  # Servidor web

  # Test rápido
  curl http://localhost:3001/health
  curl http://localhost:8080

  6. Para detener los servidores:

  # Matar procesos por puerto
  pkill -f "tsx simple-baileys.ts"
  pkill -f "node server-web.js"

  # O por puerto específico
  lsof -ti:3001 | xargs kill -9
  lsof -ti:8080 | xargs kill -9

  🎯 Para usar el sistema completo:

  1. Inicia ambos servidores:
  npx tsx simple-baileys.ts &
  node server-web.js &
  2. Abre la interfaz: http://localhost:8080
  3. ¡Listo! Los servidores estarán funcionando
