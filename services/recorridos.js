// services/recorridos.js
//
// Antes, todo lo relacionado al trayecto de un excursionista (progreso,
// duracion, cantidad de puntos GPS reportados) vivia mezclado dentro del
// mismo nodo excursionistas. Este modulo mantiene un nodo separado,
// recorridos, con un documento por cada ascenso (referenciando al
// excursionista mediante idExcursionista, igual que describe el modelo de
// datos del capitulo V), pensado para poder consultar el historial de
// recorridos de una persona sin tener que traer tambien sus datos
// personales.
//
// El detalle de cada coordenada GPS reportada se sigue guardando en
// excursionistas/{id}/historialUbicaciones (para no duplicar datos ni
// arriesgar la logica de deteccion de anomalias, que ya depende de esa
// estructura); aqui se guarda un resumen del recorrido -- distancia
// acumulada, cuantos puntos se han recibido, y su estado -- mediante un
// campo de referencia (idExcursionista) hacia el nodo original.

// Crea el recorrido si es la primera ubicacion que se recibe de este
// excursionista, o actualiza el resumen si ya existia. Se usa el mismo id
// que el excursionista para el recorrido, ya que hoy la relacion es 1 a 1
// (un excursionista = un ascenso activo a la vez).
async function registrarProgresoRecorrido(db, idExcursionista, { nombreExcursionista, distanciaRecorridaKm }) {
  const ref = db.ref(`recorridos/${idExcursionista}`);
  const snapshot = await ref.once('value');

  if (!snapshot.exists()) {
    const nuevoRecorrido = {
      idRecorrido: idExcursionista,
      idExcursionista,
      nombreExcursionista: nombreExcursionista || null,
      horaInicio: Date.now(),
      horaFin: null,
      estadoRuta: 'activo',
      distanciaRecorridaKm: distanciaRecorridaKm || 0,
      cantidadPuntosGps: 1,
    };
    await ref.set(nuevoRecorrido);
    return nuevoRecorrido;
  }

  const actual = snapshot.val();
  const actualizado = {
    ...actual,
    distanciaRecorridaKm: distanciaRecorridaKm ?? actual.distanciaRecorridaKm,
    cantidadPuntosGps: (actual.cantidadPuntosGps || 0) + 1,
  };
  await ref.update(actualizado);
  return actualizado;
}

async function finalizarRecorrido(db, idExcursionista) {
  const ref = db.ref(`recorridos/${idExcursionista}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) return null; // nunca reporto ubicacion, no hay recorrido que cerrar

  const cambios = { horaFin: Date.now(), estadoRuta: 'finalizado' };
  await ref.update(cambios);
  return { ...snapshot.val(), ...cambios };
}

async function marcarCimaEnRecorrido(db, idExcursionista) {
  const ref = db.ref(`recorridos/${idExcursionista}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) return null;

  const cambios = { cumbreAlcanzadaHora: Date.now() };
  await ref.update(cambios);
  return { ...snapshot.val(), ...cambios };
}

// Historial de recorridos de un excursionista especifico (hoy es como
// mucho uno solo, pero la consulta queda lista para cuando el sistema
// permita ver ascensos anteriores de la misma persona).
async function obtenerRecorridosDeExcursionista(db, idExcursionista) {
  const snapshot = await db.ref('recorridos').orderByChild('idExcursionista').equalTo(idExcursionista).once('value');
  return Object.values(snapshot.val() || {});
}

async function listarRecorridos(db) {
  const snapshot = await db.ref('recorridos').once('value');
  return Object.values(snapshot.val() || {}).sort((a, b) => (b.horaInicio || 0) - (a.horaInicio || 0));
}

module.exports = {
  registrarProgresoRecorrido,
  finalizarRecorrido,
  marcarCimaEnRecorrido,
  obtenerRecorridosDeExcursionista,
  listarRecorridos,
};
