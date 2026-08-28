// services/colaboradores.js
//
// Cuentas de colaboradores (personas en la cima que atienden excursionistas).
// Son cuentas independientes de la contrasena de administrador: el
// administrador las crea desde el panel, con un correo o telefono y una
// contrasena que el mismo asigna. Tienen un rol limitado ("colaborador"):
// solo pueden ver la pestana de "Tiempo real" y marcar alertas como
// atendidas, nunca el resto del panel administrativo.
//
// Ademas se guarda un registro de accesos (quien entro y a que hora) para
// que el administrador pueda revisarlo en la pestana de Colaboradores.

const crypto = require('crypto');

// Hash simple con sal, sin dependencias externas (no se guarda la
// contrasena en texto plano). Suficiente para el alcance de este proyecto;
// si se quisiera reforzar mas adelante, se recomienda migrar a bcrypt.
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

function generarSalt() {
  return crypto.randomBytes(8).toString('hex');
}

// Crea un colaborador nuevo. usuario puede ser correo o telefono.
async function crearColaborador(db, { usuario, password, nombre }) {
  if (!usuario || !password) {
    throw new Error('usuario y password son obligatorios.');
  }

  const snapshotExistente = await db
    .ref('colaboradores')
    .orderByChild('usuario')
    .equalTo(usuario)
    .once('value');
  if (snapshotExistente.exists()) {
    throw new Error('Ya existe un colaborador con ese usuario.');
  }

  const salt = generarSalt();
  const ref = db.ref('colaboradores').push();
  const colaborador = {
    id: ref.key,
    usuario,
    nombre: nombre || usuario,
    salt,
    passwordHash: hashPassword(password, salt),
    activo: true,
    rol: 'colaborador',
    fechaCreacion: Date.now(),
  };
  await ref.set(colaborador);

  const { salt: _s, passwordHash: _p, ...publico } = colaborador;
  return publico;
}

// Verifica credenciales de colaborador y, si son validas y la cuenta esta
// activa, registra el acceso (fecha/hora) en el historial.
async function iniciarSesionColaborador(db, { usuario, password }) {
  const snapshot = await db
    .ref('colaboradores')
    .orderByChild('usuario')
    .equalTo(usuario)
    .once('value');
  const datos = snapshot.val();
  if (!datos) return { ok: false, error: 'Usuario o contrasena incorrectos.' };

  const [id, colaborador] = Object.entries(datos)[0];
  if (!colaborador.activo) {
    return { ok: false, error: 'Esta cuenta fue desactivada por el administrador.' };
  }
  const hashCalculado = hashPassword(password, colaborador.salt);
  if (hashCalculado !== colaborador.passwordHash) {
    return { ok: false, error: 'Usuario o contrasena incorrectos.' };
  }

  const accesoRef = db.ref(`colaboradores/${id}/historialAccesos`).push();
  const fechaAcceso = Date.now();
  await accesoRef.set({ fecha: fechaAcceso });

  return {
    ok: true,
    colaborador: { id, usuario: colaborador.usuario, nombre: colaborador.nombre, rol: 'colaborador' },
  };
}

async function listarColaboradores(db) {
  const snapshot = await db.ref('colaboradores').once('value');
  const datos = snapshot.val() || {};
  return Object.values(datos).map(({ salt, passwordHash, ...resto }) => resto);
}

async function cambiarEstadoColaborador(db, id, activo) {
  const ref = db.ref(`colaboradores/${id}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) throw new Error('Colaborador no encontrado.');
  await ref.update({ activo: Boolean(activo) });
}

async function eliminarColaborador(db, id) {
  const ref = db.ref(`colaboradores/${id}`);
  const snapshot = await ref.once('value');
  if (!snapshot.exists()) throw new Error('Colaborador no encontrado.');
  await ref.remove();
}

module.exports = {
  crearColaborador,
  iniciarSesionColaborador,
  listarColaboradores,
  cambiarEstadoColaborador,
  eliminarColaborador,
};
