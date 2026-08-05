// routes/excursionistas.js
// Endpoints para registrar excursionistas, actualizar su ubicacion GPS
// y consultarlos desde el panel administrativo.
//
// Nota de privacidad: estos datos (nombre, telefono, contacto de emergencia)
// se eliminan automaticamente despues de unos dias. Ver services/limpiezaDatos.js.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { analizarUbicacion, estaEnLaCima, regresoAlPueblo } = require('../services/deteccionAnomalias');
const { registrarAlerta } = require('../services/gestionAlertas');

// POST /api/excursionistas
// Registra un nuevo excursionista antes de iniciar el recorrido.
router.post('/', async (req, res) => {
  try {
    const {
      nombre,
      telefono,
      dpi,
      personasGrupo,
      horaSalidaEstimada,
      contactoEmergenciaNombre,
      contactoEmergenciaTelefono,
    } = req.body;

    if (!nombre || !telefono) {
      return res.status(400).json({ error: 'Nombre y telefono son obligatorios.' });
    }
    if (!contactoEmergenciaTelefono) {
      return res.status(400).json({ error: 'El telefono de un contacto de emergencia es obligatorio.' });
    }

    const nuevoRef = db.ref('excursionistas').push();
    const excursionista = {
      id: nuevoRef.key,
      nombre,
      telefono,
      dpi: dpi || null,
      personasGrupo: personasGrupo || 1,
      horaSalidaEstimada: horaSalidaEstimada || null,
      contactoEmergenciaNombre: contactoEmergenciaNombre || null,
      contactoEmergenciaTelefono,
      estado: 'activo', // activo | finalizado
      fechaRegistro: Date.now(),
      ubicacionActual: null,
      historialUbicaciones: {},
    };

    await nuevoRef.set(excursionista);
    res.status(201).json(excursionista);
  } catch (error) {
    console.error('Error al registrar excursionista:', error);
    res.status(500).json({ error: 'No se pudo registrar al excursionista.' });
  }
});

// GET /api/excursionistas
// Lista todos los excursionistas (para el panel administrativo).
// Filtro opcional: /api/excursionistas?estado=activo
router.get('/', async (req, res) => {
  try {
    const snapshot = await db.ref('excursionistas').once('value');
    const datos = snapshot.val() || {};
    let lista = Object.values(datos);

    if (req.query.estado) {
      lista = lista.filter((e) => e.estado === req.query.estado);
    }

    lista.sort((a, b) => b.fechaRegistro - a.fechaRegistro);
    res.json(lista);
  } catch (error) {
    console.error('Error al listar excursionistas:', error);
    res.status(500).json({ error: 'No se pudo obtener la lista de excursionistas.' });
  }
});

// GET /api/excursionistas/:id
router.get('/:id', async (req, res) => {
  try {
    const snapshot = await db.ref(`excursionistas/${req.params.id}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Excursionista no encontrado.' });
    }
    res.json(snapshot.val());
  } catch (error) {
    console.error('Error al obtener excursionista:', error);
    res.status(500).json({ error: 'No se pudo obtener el excursionista.' });
  }
});

// POST /api/excursionistas/:id/ubicacion
// Se llama periodicamente desde el navegador del excursionista (geolocation
// del navegador, sin app nativa) para reportar su posicion actual.
// Aqui es donde se ejecuta el modulo de deteccion de anomalias (cap. III, 3.10).
router.post('/:id/ubicacion', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'lat y lng son obligatorios.' });
    }

    const ref = db.ref(`excursionistas/${req.params.id}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Excursionista no encontrado.' });
    }
    const excursionista = snapshot.val();

    const nuevaUbicacion = { lat, lng, timestamp: Date.now() };

    // 1) Deteccion de anomalias / alertas predictivas / clasificacion de emergencia
    const alertaGenerada = analizarUbicacion(excursionista, nuevaUbicacion);

    // 2) Guardar la nueva ubicacion y el historial de recorrido
    await ref.update({
      ubicacionActual: nuevaUbicacion,
      [`historialUbicaciones/${nuevaUbicacion.timestamp}`]: nuevaUbicacion,
    });

    // 3) Si el analisis detecto algo anormal, registrar (o actualizar) la alerta.
    // Se usa registrarAlerta para que, mientras la misma persona siga con la
    // misma anomalia sin atender, no se acumulen filas repetidas en el panel.
    let alertaGuardada = null;
    if (alertaGenerada) {
      alertaGuardada = await registrarAlerta(db, {
        excursionistaId: req.params.id,
        excursionistaNombre: excursionista.nombre,
        ubicacion: nuevaUbicacion,
        atendida: false,
        origen: 'automatica',
        ...alertaGenerada,
      });
    }

    res.json({ ubicacionActual: nuevaUbicacion, alerta: alertaGuardada });
  } catch (error) {
    console.error('Error al actualizar ubicacion:', error);
    res.status(500).json({ error: 'No se pudo actualizar la ubicacion.' });
  }
});

// PATCH /api/excursionistas/:id/cima
// El excursionista confirma que llego a la cima. Se guarda la hora y si la
// ubicacion reportada coincide con el area real de la cima (informativo,
// no bloquea la confirmacion: el excursionista puede tener mala señal GPS).
router.patch('/:id/cima', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const ref = db.ref(`excursionistas/${req.params.id}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Excursionista no encontrado.' });
    }

    const ubicacionValida = lat != null && lng != null;
    const coincideConCima = ubicacionValida ? estaEnLaCima({ lat, lng }) : null;

    await ref.update({
      cumbreAlcanzada: true,
      cumbreFechaHora: Date.now(),
      cumbreUbicacionConfirmada: coincideConCima,
    });

    res.json({
      mensaje: '¡Felicidades por llegar a la cima!',
      cumbreUbicacionConfirmada: coincideConCima,
    });
  } catch (error) {
    console.error('Error al confirmar cima:', error);
    res.status(500).json({ error: 'No se pudo registrar la llegada a la cima.' });
  }
});

// PATCH /api/excursionistas/:id/finalizar
// Marca el recorrido como finalizado. Se conserva la ultima ubicacion
// conocida (no se borra), y se verifica informativamente si esa ubicacion
// esta cerca del pueblo de Santa Maria de Jesus.
router.patch('/:id/finalizar', async (req, res) => {
  try {
    const ref = db.ref(`excursionistas/${req.params.id}`);
    const snapshot = await ref.once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Excursionista no encontrado.' });
    }
    const excursionista = snapshot.val();

    const ultimaUbicacion = excursionista.ubicacionActual;
    const retornoConfirmado = ultimaUbicacion ? regresoAlPueblo(ultimaUbicacion) : null;

    await ref.update({
      estado: 'finalizado',
      fechaFinalizacion: Date.now(),
      retornoConfirmado, // true/false/null (null = sin ubicacion para verificar)
    });

    res.json({
      mensaje: 'Recorrido finalizado.',
      retornoConfirmado,
    });
  } catch (error) {
    console.error('Error al finalizar recorrido:', error);
    res.status(500).json({ error: 'No se pudo finalizar el recorrido.' });
  }
});

module.exports = router;
