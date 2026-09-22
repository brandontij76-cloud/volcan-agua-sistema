// services/historialClima.js
//
// Antes, cada vez que el asistente pedia el clima (a Open-Meteo, o el
// respaldo estacional si la API fallaba) ese dato se usaba una sola vez
// para armar una respuesta y se descartaba: no quedaba ningun registro de
// que clima se uso para dar que recomendacion, ni con que frecuencia la
// API real fallo y hubo que caer al respaldo.
//
// Este modulo guarda cada consulta en el nodo raiz "historial_clima" de
// Firebase. Es una tabla nueva e independiente: no es lo mismo que
// configuracion_ruta/parametros_sistema (esos son ajustes que pone el
// administrador, no lecturas de clima), ni que historial_entrenamiento_ia
// (esa guarda metricas de entrenamiento del modelo de riesgo, no clima).
//
// Guardar esto sirve para dos cosas concretas: (1) evidencia de que tan
// seguido se usa clima real vs. el respaldo estacional, y (2) datos que
// mas adelante se podrian cruzar con el historial de alertas para afinar
// el modelo de riesgo (por ejemplo, ver si las alertas se concentran en
// dias con alta probabilidad de lluvia).

// Registra una consulta de clima. Nunca lanza error hacia arriba: si falla
// el guardado, se avisa en consola pero la recomendacion/respuesta que ya
// se le dio a la persona no se ve afectada.
async function registrarConsultaClima(db, { clima, fechaConsultadaISO, origen }) {
  if (!db || !clima) return null;

  try {
    const ref = db.ref('historial_clima').push();
    const registro = {
      id: ref.key,
      fechaConsultada: fechaConsultadaISO || new Date().toISOString(),
      fechaRegistro: Date.now(),
      origen: origen || 'desconocido', // 'recomendaciones' | 'ficha_ruta' | 'chatbot_clima' | 'chatbot_equipo'
      fuenteClima: clima.fuenteClima || null, // 'api' | 'estacional'
      temperaturaC: clima.temperaturaC ?? null,
      probabilidadLluvia: clima.probabilidadLluvia ?? null,
      vientoKmh: clima.vientoKmh ?? null,
      nubosidad: clima.nubosidad ?? null,
      temporada: clima.temporada || null,
    };
    await ref.set(registro);
    return registro;
  } catch (error) {
    console.warn('[Historial Clima] No se pudo guardar la consulta de clima:', error.message);
    return null;
  }
}

// Lista el historial de clima consultado, mas reciente primero. limite
// evita traer miles de filas de una sola vez al panel administrativo.
async function listarHistorialClima(db, limite = 200) {
  const snapshot = await db.ref('historial_clima').once('value');
  const filas = Object.values(snapshot.val() || {});
  return filas.sort((a, b) => (b.fechaRegistro || 0) - (a.fechaRegistro || 0)).slice(0, limite);
}

module.exports = { registrarConsultaClima, listarHistorialClima };
