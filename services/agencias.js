// services/agencias.js
//
// Agencias turisticas: empresas que contactan a la municipalidad para
// inscribir grupos de turistas. Se guardan por separado de los
// excursionistas individuales; cada excursionista puede (opcionalmente)
// quedar asociado a una agencia via el campo agenciaId.

async function crearAgencia(db, { nombre, representante, telefono }) {
  if (!nombre) {
    throw new Error('El nombre de la agencia es obligatorio.');
  }
  const ref = db.ref('agencias').push();
  const agencia = {
    id: ref.key,
    nombre,
    representante: representante || null,
    telefono: telefono || null,
    fechaCreacion: Date.now(),
  };
  await ref.set(agencia);
  return agencia;
}

async function listarAgencias(db) {
  const snapshot = await db.ref('agencias').once('value');
  const datos = snapshot.val() || {};
  return Object.values(datos).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

async function eliminarAgencia(db, id) {
  const ref = db.ref(`agencias/${id}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) throw new Error('Agencia no encontrada.');
  await ref.remove();
}

module.exports = { crearAgencia, listarAgencias, eliminarAgencia };
