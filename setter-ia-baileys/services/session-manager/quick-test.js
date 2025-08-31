// Testing rápido con Node.js
const API_URL = 'http://localhost:3001';

// Tu número de WhatsApp (cámbialo por el tuyo)
const YOUR_PHONE = '+17862537273';

async function makeRequest(url, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error?.message || 'Request failed');
    }
    
    return data;
}

async function testPairingCode() {
    try {
        console.log('🚀 Testing Código de Emparejamiento');
        console.log('===================================');
        
        // 1. Reset sistema
        console.log('\n🧹 1. Reseteando sistema...');
        await makeRequest(`${API_URL}/api/v1/system/reset`, 'POST');
        console.log('✅ Sistema reseteado');
        
        // 2. Crear sesión con número
        console.log('\n📱 2. Creando sesión...');
        const sessionName = `test${Date.now()}`;
        const session = await makeRequest(`${API_URL}/api/v1/sessions`, 'POST', {
            sessionName,
            phoneNumber: YOUR_PHONE
        });
        
        console.log(`✅ Sesión creada: ${session.data.id}`);
        console.log(`   📞 Número: ${session.data.phoneNumber}`);
        
        // 3. Conectar sesión
        console.log('\n🔗 3. Conectando sesión...');
        const connect = await makeRequest(`${API_URL}/api/v1/sessions/${session.data.id}/connect`, 'POST');
        
        if (connect.data.code) {
            console.log('\n🔢 ¡CÓDIGO DE EMPAREJAMIENTO GENERADO!');
            console.log('====================================');
            console.log(`   📱 Código: ${connect.data.code}`);
            console.log(`   📞 Número: ${connect.data.phoneNumber}`);
            console.log('====================================');
            console.log('\n📱 Para vincular en WhatsApp:');
            console.log('   1. Configuración > Dispositivos vinculados');
            console.log('   2. Vincular un dispositivo > Vincular con número');
            console.log(`   3. Ingresa: ${connect.data.code}`);
            
            return session.data.id;
        } else {
            console.log('❌ No se generó código de emparejamiento');
            console.log('Respuesta:', connect);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

async function testQRCode() {
    try {
        console.log('🚀 Testing QR Code');
        console.log('==================');
        
        // 1. Reset sistema
        console.log('\n🧹 1. Reseteando sistema...');
        await makeRequest(`${API_URL}/api/v1/system/reset`, 'POST');
        console.log('✅ Sistema reseteado');
        
        // 2. Crear sesión SIN número
        console.log('\n📱 2. Creando sesión...');
        const sessionName = `qr${Date.now()}`;
        const session = await makeRequest(`${API_URL}/api/v1/sessions`, 'POST', {
            sessionName
            // NO phoneNumber para QR
        });
        
        console.log(`✅ Sesión creada: ${session.data.id}`);
        
        // 3. Conectar sesión
        console.log('\n🔗 3. Conectando sesión...');
        await makeRequest(`${API_URL}/api/v1/sessions/${session.data.id}/connect`, 'POST');
        
        // 4. Esperar QR
        console.log('\n📱 4. Esperando QR code...');
        
        for (let i = 1; i <= 10; i++) {
            console.log(`   Intento ${i}/10...`);
            
            try {
                const qr = await makeRequest(`${API_URL}/api/v1/sessions/${session.data.id}/qr`);
                console.log('✅ ¡QR Code disponible!');
                console.log('💡 Abre test/whatsapp-test-fixed.html para ver el QR');
                return session.data.id;
            } catch (error) {
                if (i === 10) {
                    console.log('❌ QR no disponible después de 10 intentos');
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// Ejecutar tests
console.log('🔧 Métodos de testing disponibles:');
console.log('==================================');
console.log('1. Código de emparejamiento: testPairingCode()');
console.log('2. QR Code: testQRCode()');
console.log('\n💡 Cambia YOUR_PHONE en la línea 4 por tu número');
console.log('💡 Luego ejecuta: node quick-test.js');

// Ejecutar automáticamente si se pasa parámetro
const args = process.argv.slice(2);
if (args[0] === 'pairing') {
    testPairingCode();
} else if (args[0] === 'qr') {
    testQRCode();
} else {
    console.log('\n🚀 Uso:');
    console.log('   node quick-test.js pairing  # Para código de emparejamiento');
    console.log('   node quick-test.js qr       # Para QR code');
}