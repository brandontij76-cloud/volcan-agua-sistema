// routes/configuracion.js
//
// Antes, para cambiar un umbral (por ejemplo, el radio de desviacion que
// dispara una alerta) habia que editar deteccionAnomalias.js y volver a
// desplegar el servidor. Ahora esos valores viven en Firebase
// (configuracion_ruta y parametros_sistema) y el administrador puede
// verlos y ajustarlos desde aqui, sin tocar codigo.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const {
  obtenerConfiguracionRuta,
  obtenerParametrosSistema,
  actualizarConfiguracionRuta,
  actualizarParametrosSistema,
} = require('../services/configuracionSistema');
const { obtenerIntents, actualizarIntent } = require('../services/intentsChatbot');
const { entrenarYRegistrarModelo, obtenerHistorialEntrenamiento } = require('../services/modeloRiesgoIA');
const { requiereAdmin } = require('../middleware/autenticacion');

// Todo este archivo es exclusivo del panel administrativo.
router.use(requiereAdmin);

// GET /api/admin/configuracion
// Devuelve los tres nodos juntos, para mostrarlos en una sola pantalla.
router.get('/', (req, res) => {
  res.json({
    configuracionRuta: obtenerConfiguracionRuta(),
    parametrosSistema: obtenerParametrosSistema(),
    intentsChatbot: obtenerIntents(),
  });
});

// PATCH /api/admin/configuracion/ruta
// Actualiza solo los campos "informativos" de la ruta (distancia, desnivel,
// dificultad, nombre). Cambiar las coordenadas completas de la traza o de
// los puntos de referencia requiere subir un KMZ nuevo (fuera del alcance
// de este endpoint, por seguridad: un error de tipeo en coordenadas podria
// romper la deteccion de desviacion de ruta).
router.patch('/ruta', async (req, res) => {
  try {
    const { nombreRuta, distanciaKm, desnivelM, dificultad, radioCimaMetros, radioRetornoMetros } = req.body;
    const cambios = {};
    if (nombreRuta != null) cambios.nombreRuta = nombreRuta;
    if (distanciaKm != null) cambios.distanciaKm = Number(distanciaKm);
    if (desnivelM != null) cambios.desnivelM = Number(desnivelM);
    if (dificultad != null) cambios.dificultad = dificultad;
    if (radioCimaMetros != null) cambios.radioCimaMetros = Number(radioCimaMetros);
    if (radioRetornoMetros != null) cambios.radioRetornoMetros = Number(radioRetornoMetros);

    const actualizado = await actualizarConfiguracionRuta(db, cambios);
    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar configuracion_ruta:', error);
    res.status(500).json({ error: 'No se pudo actualizar la configuracion de la ruta.' });
  }
});

// PATCH /api/admin/configuracion/parametros
// Actualiza los umbrales del sistema (desviacion, inactividad, riesgo alto,
// dias de retencion de datos personales).
router.patch('/parametros', async (req, res) => {
  try {
    const { umbralDesviacionMetros, umbralInactividadMinutos, umbralRiesgoAlto, diasRetencionDatos } = req.body;
    const cambios = {};
    if (umbralDesviacionMetros != null) cambios.umbralDesviacionMetros = Number(umbralDesviacionMetros);
    if (umbralInactividadMinutos != null) cambios.umbralInactividadMinutos = Number(umbralInactividadMinutos);
    if (umbralRiesgoAlto != null) cambios.umbralRiesgoAlto = Number(umbralRiesgoAlto);
    if (diasRetencionDatos != null) cambios.diasRetencionDatos = Number(diasRetencionDatos);

    const actualizado = await actualizarParametrosSistema(db, cambios);
    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar parametros_sistema:', error);
    res.status(500).json({ error: 'No se pudo actualizar los parametros del sistema.' });
  }
});

// PATCH /api/admin/configuracion/intents/:categoria
// Actualiza la respuesta base (y opcionalmente el nombre o las palabras
// clave de referencia) de una categoria del asistente. categoria es una
// de: clima, equipo, ruta, emergencia, registro_uso, saludo, default.
router.patch('/intents/:categoria', async (req, res) => {
  try {
    const { nombreIntent, palabrasClave, respuestaBase, activo } = req.body;
    const cambios = {};
    if (nombreIntent != null) cambios.nombreIntent = nombreIntent;
    if (Array.isArray(palabrasClave)) cambios.palabrasClave = palabrasClave;
    if (respuestaBase != null) cambios.respuestaBase = respuestaBase;
    if (activo != null) cambios.activo = Boolean(activo);

    const actualizado = await actualizarIntent(db, req.params.categoria, cambios);
    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar intents_chatbot:', error);
    res.status(400).json({ error: error.message || 'No se pudo actualizar la categoría del asistente.' });
  }
});

// GET /api/admin/configuracion/historial-entrenamiento
// Lista todos los entrenamientos del modelo de IA de riesgo realizados
// hasta ahora, mas reciente primero (nodo historial_entrenamiento_ia).
router.get('/historial-entrenamiento', async (req, res) => {
  try {
    const historial = await obtenerHistorialEntrenamiento(db);
    res.json(historial);
  } catch (error) {
    console.error('Error al obtener historial de entrenamiento:', error);
    res.status(500).json({ error: 'No se pudo obtener el historial de entrenamiento.' });
  }
});

// POST /api/admin/configuracion/reentrenar-modelo
// Entrena el modelo de IA de riesgo con los datos actuales y deja
// constancia del resultado (fecha, cantidad de registros, metricas) en
// historial_entrenamiento_ia, para poder comparar un entrenamiento
// contra los anteriores.
router.post('/reentrenar-modelo', async (req, res) => {
  try {
    const registro = await entrenarYRegistrarModelo(db);
    res.status(201).json(registro);
  } catch (error) {
    console.error('Error al reentrenar el modelo:', error);
    res.status(500).json({ error: 'No se pudo reentrenar el modelo.' });
  }
});

module.exports = router;
