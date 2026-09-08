// server.js
// Punto de entrada del servidor. Sirve el frontend (public/) y expone la API.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const excursionistasRoutes = require('./routes/excursionistas');
const alertasRoutes = require('./routes/alertas');
const asistenteRoutes = require('./routes/asistente');
const colaboradoresRoutes = require('./routes/colaboradores');
const agenciasRoutes = require('./routes/agencias');
const adminExtraRoutes = require('./routes/adminExtra');
const { RUTA_REFERENCIA_VOLCAN_DE_AGUA, PUNTOS_REFERENCIA_RUTA } = require('./services/deteccionAnomalias');
const { ejecutarLimpiezaDatos, RETENCION_MAXIMA_DIAS } = require('./services/limpiezaDatos');
const { db, firebaseConfigurado } = require('./config/firebase');
const { generarToken } = require('./services/autenticacion');
const { limitarIntentos } = require('./services/limitadorIntentos');

const app = express();
const PORT = process.env.PORT || 3000;

// Detras del proxy de Render (u otro hosting con proxy inverso), esto hace
// que req.ip refleje la IP real de quien visita, no la del proxy. Es
// necesario para que el limitador de intentos de login funcione por
// persona y no trate a todo el mundo como una sola IP.
app.set('trust proxy', 1);

// Cabeceras de seguridad HTTP estandar (protege contra clickjacking,
// sniffing de MIME, y otras clases de ataque comunes). Se desactiva CSP
// por defecto porque el sitio carga Bootstrap/Leaflet desde CDNs externos
// y una politica estricta rompería esos recursos sin una configuracion
// mas detallada.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: solo se permite acceder a la API desde el propio sitio (y desde
// localhost durante desarrollo). Antes estaba abierto a cualquier origen
// sin restriccion.
const origenesPermitidos = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim());
app.use(cors({
  origin(origen, callback) {
    // Peticiones sin header Origin (apps moviles, curl, servidor a servidor)
    // se permiten; el navegador siempre manda Origin en peticiones cross-site.
    if (!origen || origenesPermitidos.includes(origen)) return callback(null, true);
    callback(new Error('Origen no permitido por la politica de CORS.'));
  },
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ---
app.use('/api/excursionistas', excursionistasRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api/colaboradores', colaboradoresRoutes);
app.use('/api/agencias', agenciasRoutes);

// Ruta de referencia del sendero, usada por el mapa para dibujar el camino.
app.get('/api/ruta-referencia', (req, res) => {
  res.json(RUTA_REFERENCIA_VOLCAN_DE_AGUA);
});

// Puntos con nombre a lo largo de la ruta (Capilla, Mirador, Cima, etc.),
// usados por el mapa para mostrar marcadores de referencia.
app.get('/api/puntos-referencia', (req, res) => {
  res.json(PUNTOS_REFERENCIA_RUTA);
});

// Login del panel administrativo (compara contra ADMIN_PASSWORD del .env).
// Si es correcta, entrega un token firmado que el navegador debe reenviar
// en cada peticion protegida (header Authorization: Bearer <token>) --
// antes, ninguna ruta de la API verificaba esto, solo la pantalla.
app.post('/api/admin/login', limitarIntentos('admin-login'), (req, res) => {
  const { password } = req.body;
  const passwordEsperada = process.env.ADMIN_PASSWORD;

  if (!passwordEsperada) {
    console.error('[SEGURIDAD] ADMIN_PASSWORD no esta configurada en las variables de entorno.');
    return res.status(500).json({ ok: false, error: 'El servidor no tiene configurada la contraseña de administrador.' });
  }

  if (password && password === passwordEsperada) {
    const token = generarToken({ rol: 'admin' });
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: 'Contrasena incorrecta.' });
});

// Estadisticas semanales y exportacion a Excel (montado despues del login
// de arriba para que /api/admin/login siempre lo maneje la ruta especifica).
app.use('/api/admin', adminExtraRoutes);

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
