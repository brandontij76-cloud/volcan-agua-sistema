// server.js
// Punto de entrada del servidor. Sirve el frontend (public/) y expone la API.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const excursionistasRoutes = require('./routes/excursionistas');
const alertasRoutes = require('./routes/alertas');
const asistenteRoutes = require('./routes/asistente');
const { RUTA_REFERENCIA_VOLCAN_DE_AGUA, PUNTOS_REFERENCIA_RUTA } = require('./services/deteccionAnomalias');
const { ejecutarLimpiezaDatos, RETENCION_MAXIMA_DIAS } = require('./services/limpiezaDatos');
const { db, firebaseConfigurado } = require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---
app.use('/api/excursionistas', excursionistasRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/asistente', asistenteRoutes);

// Ruta de referencia del sendero, usada por el mapa para dibujar el camino.
app.get('/api/ruta-referencia', (req, res) => {
  res.json(RUTA_REFERENCIA_VOLCAN_DE_AGUA);
});

// Puntos con nombre a lo largo de la ruta (Capilla, Mirador, Cima, etc.),
// usados por el mapa para mostrar marcadores de referencia.
app.get('/api/puntos-referencia', (req, res) => {
  res.json(PUNTOS_REFERENCIA_RUTA);
});

// Login simple del panel administrativo (compara contra ADMIN_PASSWORD del .env).
// No es un sistema de autenticacion robusto: es suficiente para una primera
// version funcional. Si el proyecto crece, esto deberia reemplazarse por
// Firebase Authentication.
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password && password === (process.env.ADMIN_PASSWORD || 'admin123')) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Contrasena incorrecta.' });
});

// Cualquier ruta no reconocida de la API responde 404 en formato JSON.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

// --- Limpieza automatica de datos personales (nombre, telefono) ---
// Por privacidad, ningun excursionista se conserva en la base de datos por
// mas de RETENCION_MAXIMA_DIAS. Ver services/limpiezaDatos.js para el detalle.
const INTERVALO_LIMPIEZA_MS = 60 * 60 * 1000; // revisa cada hora

if (firebaseConfigurado) {
  ejecutarLimpiezaDatos(db).catch((error) => console.error('Error en limpieza de datos:', error));
  setInterval(() => {
    ejecutarLimpiezaDatos(db).catch((error) => console.error('Error en limpieza de datos:', error));
  }, INTERVALO_LIMPIEZA_MS);
} else {
  console.warn(
    `[AVISO] Limpieza automatica de datos desactivada (Firebase no configurado). ` +
    `Cuando conectes Firebase, los datos se borraran solos despues de ${RETENCION_MAXIMA_DIAS} dias.`
  );
}

app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}`);
  console.log('Paginas disponibles:');
  console.log(`  Registro          -> http://localhost:${PORT}/index.html`);
  console.log(`  Monitor (GPS)     -> http://localhost:${PORT}/monitor.html`);
  console.log(`  Panel administrativo -> http://localhost:${PORT}/admin.html\n`);
});
