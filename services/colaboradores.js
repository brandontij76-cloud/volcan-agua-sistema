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
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

// Hash de contrasenas con scrypt (funcion nativa de Node, pensada
// especificamente para contrasenas: es deliberadamente lenta y usa mucha
// memoria, lo que hace muy caro probar millones de combinaciones por
// fuerza bruta si alguien llegara a robar la base de datos). Antes se
// usaba un SHA256 simple con sal, que es rapido de calcular y por lo
// tanto mas facil de atacar por fuerza bruta si se filtran los hashes.
async function hashPassword(password, salt) {
  const derivado = await scryptAsync(password, salt, 64);
  return derivado.toString('hex');
}

function generarSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// Compatibilidad con cuentas creadas antes de este cambio (que usaban
// SHA256 simple, cuyo resultado siempre mide 64 caracteres hex). Sirve
// solo para verificar el password en el proximo login; si coincide, se
// vuelve a guardar automaticamente con scrypt (ver iniciarSesionColaborador).
function hashPasswordSha256Legado(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
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
    passwordHash: await hashPassword(password, salt),
    algoritmoHash: 'scrypt',
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

  const esCuentaLegado = colaborador.algoritmoHash !== 'scrypt';
  let coincide;
  if (esCuentaLegado) {
    coincide = hashPasswordSha256Legado(password, colaborador.salt) === colaborador.passwordHash;
  } else {
    coincide = (await hashPassword(password, colaborador.salt)) === colaborador.passwordHash;
  }

  if (!coincide) {
    return { ok: false, error: 'Usuario o contrasena incorrectos.' };
  }

  // Migracion silenciosa: si la cuenta todavia usaba el hash antiguo,
  // ahora que sabemos la contrasena correcta se vuelve a guardar con
  // scrypt, sin que el colaborador tenga que hacer nada.
  if (esCuentaLegado) {
    const nuevoSalt = generarSalt();
    await db.ref(`colaboradores/${id}`).update({
      salt: nuevoSalt,
      passwordHash: await hashPassword(password, nuevoSalt),
      algoritmoHash: 'scrypt',
    });
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
  return Object.values(datos).map(({ salt, passwordHash, algoritmoHash, ...resto }) => resto);
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
