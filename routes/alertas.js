// routes/alertas.js
// Endpoints para el boton de panico (alerta manual) y para que el panel
// administrativo consulte y atienda las alertas generadas.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');

// POST /api/alertas
// Alerta manual: el excursionista presiona el boton de emergencia.
// Esta siempre se clasifica como "grave" porque es una peticion de auxilio
// directa de la persona, a diferencia de las alertas automaticas del
// modulo de deteccion de anomalias.
router.post('/', async (req, res) => {
  try {
    const { excursionistaId, excursionistaNombre, lat, lng, mensaje } = req.body;

    if (!excursionistaId || lat == null || lng == null) {
      return res.status(400).json({ error: 'excursionistaId, lat y lng son obligatorios.' });
    }

    const alertaRef = db.ref('alertas').push();
    const alerta = {
      id: alertaRef.key,
      excursionistaId,
      excursionistaNombre: excursionistaNombre || 'Excursionista',
      tipo: 'boton_panico',
      nivel: 'grave',
      mensaje: mensaje || 'El excursionista activo el boton de emergencia.',
      ubicacion: { lat, lng, timestamp: Date.now() },
      atendida: false,
      origen: 'manual',
      timestamp: Date.now(),
    };

    await alertaRef.set(alerta);
    res.status(201).json(alerta);
  } catch (error) {
    console.error('Error al crear alerta:', error);
    res.status(500).json({ error: 'No se pudo registrar la alerta.' });
  }
});

// GET /api/alertas
// Lista las alertas. Filtro opcional: /api/alertas?atendida=false
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.ref('alertas').once('value');
    const datos = snapshot.val() || {};
    let lista = Object.values(datos);

    if (req.query.atendida !== undefined) {
      const atendida = req.query.atendida === 'true';
      lista = lista.filter((a) => a.atendida === atendida);
    }

    lista.sort((a, b) => b.timestamp - a.timestamp);
    res.json(lista);
  } catch (error) {
    console.error('Error al listar alertas:', error);
    res.status(500).json({ error: 'No se pudo obtener la lista de alertas.' });
  }
});

// PATCH /api/alertas/:id/atender
// El administrador marca una alerta como atendida.
router.patch('/:id/atender', async (req, res) => {
  try {
    const ref = db.ref(`alertas/${req.params.id}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Alerta no encontrada.' });
    }
    await ref.update({ atendida: true, fechaAtencion: Date.now() });
    res.json({ mensaje: 'Alerta marcada como atendida.' });
  } catch (error) {
    console.error('Error al atender alerta:', error);
    res.status(500).json({ error: 'No se pudo actualizar la alerta.' });
  }
});

module.exports = router;
