const express = require('express');
const path = require('path');

const app = express();
const port = 8080;

// Servir archivos estáticos
app.use(express.static(__dirname));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'supaagentes.html'));
});

app.listen(port, () => {
    console.log(`🌐 Servidor web corriendo en http://localhost:${port}`);
    console.log(`📱 Abre: http://localhost:${port} para usar la interfaz`);
});