// services/limpiezaDatos.js
//
// Por privacidad, los datos personales (nombre, telefono, contacto de
// emergencia) de un excursionista no deben conservarse mas de lo necesario.
// Este modulo elimina de Firebase, de forma automatica, cualquier
// excursionista y sus alertas asociadas cuya antiguedad supere el limite
// definido en RETENCION_MAXIMA_DIAS.
//
// Firebase Realtime Database no tiene "borrado automatico por tiempo"
// incorporado, asi que esto se resuelve corriendo esta rutina de forma
// periodica (ver server.js, donde se llama cada hora con setInterval).

const RETENCION_MAXIMA_DIAS = 3;
const RETENCION_MAXIMA_MS = RETENCION_MAXIMA_DIAS * 24 * 60 * 60 * 1000;

// Elimina excursionistas registrados hace mas de RETENCION_MAXIMA_DIAS,
// junto con su historial de ubicaciones (que vive dentro del mismo nodo).
async function limpiarExcursionistasVencidos(db) {
  const snapshot = await db.ref('excursionistas').once('value');
  const datos = snapshot.val() || {};
  const ahora = Date.now();

  // Un "pendiente" de una agencia (nombre precargado por la Municipalidad,
  // que todavia nadie confirma) puede cargarse con dias de anticipacion a
  // la subida. Su reloj de retencion corre desde la fecha de salida
  // planeada, no desde que se cargo, para no perder la lista antes de que
  // la persona tenga oportunidad de buscar su nombre y confirmar.
  function fechaLimiteDe(ex) {
    if (ex.estado === 'pendiente' && ex.fechaSalidaEstimada) {
      const fechaSalida = new Date(`${ex.fechaSalidaEstimada}T00:00:00`).getTime();
      if (!Number.isNaN(fechaSalida)) return fechaSalida;
    }
    return ex.fechaRegistro || 0;
  }

  const idsAEliminar = Object.entries(datos)
    .filter(([, ex]) => ahora - fechaLimiteDe(ex) > RETENCION_MAXIMA_MS)
    .map(([id]) => id);

  await Promise.all(idsAEliminar.map((id) => db.ref(`excursionistas/${id}`).remove()));
  return idsAEliminar;
}

// Elimina las alertas de los excursionistas ya vencidos (tambien contienen
// nombre y ubicacion, asi que deben borrarse junto con el resto).
async function limpiarAlertasDeExcursionistas(db, idsExcursionistas) {
  if (idsExcursionistas.length === 0) return 0;

  const snapshot = await db.ref('alertas').once('value');
  const datos = snapshot.val() || {};

  const idsAlertasAEliminar = Object.entries(datos)
    .filter(([, alerta]) => idsExcursionistas.includes(alerta.excursionistaId))
    .map(([id]) => id);

  await Promise.all(idsAlertasAEliminar.map((id) => db.ref(`alertas/${id}`).remove()));
  return idsAlertasAEliminar.length;
}

// Punto de entrada: corre la limpieza completa y regresa un resumen.
async function ejecutarLimpiezaDatos(db) {
  const idsExcursionistasEliminados = await limpiarExcursionistasVencidos(db);
  const totalAlertasEliminadas = await limpiarAlertasDeExcursionistas(db, idsExcursionistasEliminados);

  const resumen = {
    excursionistasEliminados: idsExcursionistasEliminados.length,
    alertasEliminadas: totalAlertasEliminadas,
  };

  if (resumen.excursionistasEliminados > 0 || resumen.alertasEliminadas > 0) {
    console.log(
      `[Limpieza de datos] Se eliminaron ${resumen.excursionistasEliminados} excursionista(s) ` +
      `y ${resumen.alertasEliminadas} alerta(s) con mas de ${RETENCION_MAXIMA_DIAS} dias de antiguedad.`
    );
  }

  return resumen;
}

module.exports = {
  ejecutarLimpiezaDatos,
  RETENCION_MAXIMA_DIAS,
  RETENCION_MAXIMA_MS,
};
