// routes/asistente.js
// Endpoint del asistente inteligente: clima + recomendaciones de equipo +
// estadistica aprendida del historial. Ver services/asistenteIA.js para
// el detalle de como se calcula cada parte.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { generarSugerenciaCompleta } = require('../services/asistenteIA');

// GET /api/asistente/recomendaciones?horaSalida=06:30&fecha=2026-08-10
// "fecha" es opcional (por defecto hoy). Se usa antes de registrarse, para
// que la persona vea que llevar segun el clima esperado a esa hora.
router.get('/recomendaciones', async (req, res) => {
  try {
    const { horaSalida, fecha } = req.query;
    const resultado = await generarSugerenciaCompleta(db, { horaSalida, fecha });
    res.json(resultado);
  } catch (error) {
    console.error('Error al generar recomendaciones:', error);
    res.status(500).json({ error: 'No se pudieron generar las recomendaciones en este momento.' });
  }
});

module.exports = router;
