// routes/asistente.js
// Endpoint del asistente inteligente: clima + recomendaciones de equipo +
// estadistica aprendida del historial. Ver services/asistenteIA.js para
// el detalle de como se calcula cada parte.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const {
  generarSugerenciaCompleta,
  obtenerPronosticoClima,
  climaEstacionalDeRespaldo,
  obtenerEstadoModelo,
  responderChat,
} = require('../services/asistenteIA');
const { INFO_RUTA_VOLCAN_DE_AGUA } = require('../services/deteccionAnomalias');

// GET /api/asistente/recomendaciones?horaSalida=06:30&fecha=2026-08-10
// "fecha" es opcional (por defecto hoy). Se usa antes de registrarse, para
// que la persona vea que llevar segun el clima esperado a esa hora.
router.get('/recomendaciones', async (req, res) => {
  try {
    const { horaSalida, fecha, personasGrupo } = req.query;
    const resultado = await generarSugerenciaCompleta(db, {
      horaSalida,
      fecha,
      personasGrupo: personasGrupo ? parseInt(personasGrupo, 10) : undefined,
    });
    res.json(resultado);
  } catch (error) {
    console.error('Error al generar recomendaciones:', error);
    res.status(500).json({ error: 'No se pudieron generar las recomendaciones en este momento.' });
  }
});

// GET /api/asistente/ficha-ruta
// Ficha resumen de la ruta (distancia, desnivel, dificultad) + clima actual,
// al estilo de las fichas de Wikiloc/AllTrails. Se usa en el panel
// administrativo y en la pantalla del excursionista, sin necesitar una
// hora de salida especifica (usa "ahora" como referencia).
router.get('/ficha-ruta', async (req, res) => {
  try {
    let clima = await obtenerPronosticoClima(new Date().toISOString());
    if (!clima) {
      clima = climaEstacionalDeRespaldo(new Date());
    }
    res.json({ infoRuta: INFO_RUTA_VOLCAN_DE_AGUA, clima });
  } catch (error) {
    console.error('Error al generar ficha de ruta:', error);
    res.status(500).json({ error: 'No se pudo obtener la ficha de la ruta en este momento.' });
  }
});

// GET /api/asistente/estado-modelo
// Estado actual del modelo de ML (cuantos datos tiene entrenados, que tan
// exacto es). Se usa en el panel administrativo como evidencia de que el
// modelo de riesgo esta realmente funcionando, no solo de adorno.
router.get('/estado-modelo', async (req, res) => {
  try {
    const estado = await obtenerEstadoModelo(db);
    res.json(estado);
  } catch (error) {
    console.error('Error al obtener estado del modelo:', error);
    res.status(500).json({ error: 'No se pudo obtener el estado del modelo en este momento.' });
  }
});

// POST /api/asistente/chat
// body: { pregunta, contexto: 'usuario' | 'admin', historial: [{rol, texto}] }
// Chatbot con Gemini, disponible tanto para excursionistas como para el
// equipo administrativo (con contexto en vivo del sistema para el admin).
router.post('/chat', async (req, res) => {
  try {
    const { pregunta, contexto, historial } = req.body;
    const resultado = await responderChat(db, { pregunta, contexto, historial });
    res.json(resultado);
  } catch (error) {
    console.error('Error en el chat del asistente:', error);
    res.status(500).json({ error: 'No se pudo responder en este momento.' });
  }
});

module.exports = router;
