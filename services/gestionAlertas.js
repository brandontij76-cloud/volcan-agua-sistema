// services/gestionAlertas.js
//
// Evita que una misma persona genere muchas filas de alerta repetidas
// (por ejemplo, si sigue fuera de la ruta durante varios envios de GPS
// consecutivos). Mientras una alerta siga "sin atender" para un
// excursionista, las nuevas detecciones actualizan esa misma alerta
// (suben el contador de "ocurrencias" y refrescan la hora) en vez de
// crear una fila nueva. Cuando el administrador la marca como atendida,
// la siguiente deteccion si genera una alerta nueva (porque representa
// un incidente distinto).

// Busca si el excursionista ya tiene una alerta sin atender.
async function buscarAlertaSinAtender(db, excursionistaId) {
  const snapshot = await db
    .ref('alertas')
    .orderByChild('excursionistaId')
    .equalTo(excursionistaId)
    .once('value');

  const datos = snapshot.val() || {};
  const entradas = Object.entries(datos);

  // Se busca la mas reciente sin atender (por si hubiera mas de una de datos viejos).
  const sinAtender = entradas
    .filter(([, alerta]) => !alerta.atendida)
    .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));

  return sinAtender.length > 0 ? { id: sinAtender[0][0], datos: sinAtender[0][1] } : null;
}

/**
 * Crea una alerta nueva o actualiza la existente sin atender del mismo
 * excursionista, para evitar que el panel administrativo se llene de
 * filas repetidas del mismo incidente.
 *
 * @param {object} db - referencia a la base de datos (firebase-admin)
 * @param {object} datosAlerta - campos de la alerta (sin id, sin ocurrencias)
 * @returns {object} la alerta final guardada (con id)
 */
async function registrarAlerta(db, datosAlerta) {
  const existente = await buscarAlertaSinAtender(db, datosAlerta.excursionistaId);

  if (existente) {
    const actualizada = {
      ...existente.datos,
      ...datosAlerta,
      ocurrencias: (existente.datos.ocurrencias || 1) + 1,
      primeraVez: existente.datos.primeraVez || existente.datos.timestamp,
      id: existente.id,
    };
    await db.ref(`alertas/${existente.id}`).update(actualizada);
    return actualizada;
  }

  const nuevaRef = db.ref('alertas').push();
  const nueva = {
    id: nuevaRef.key,
    ocurrencias: 1,
    primeraVez: datosAlerta.timestamp,
    ...datosAlerta,
  };
  await nuevaRef.set(nueva);
  return nueva;
}

module.exports = { registrarAlerta, buscarAlertaSinAtender };
