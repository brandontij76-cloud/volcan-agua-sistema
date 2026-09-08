// services/autenticacion.js
//
// Antes, el "login" del panel administrativo y del panel de colaboradores
// solo controlaba que pantalla se mostraba en el navegador (guardaba un
// valor en sessionStorage), pero ninguna ruta de la API verificaba nada en
// el servidor -- cualquiera podia llamar los endpoints directamente (con
// curl, Postman, etc.) sin haber iniciado sesion nunca.
//
// Esto agrega tokens firmados con HMAC-SHA256 (sin dependencias externas,
// usando el modulo "crypto" que ya trae Node): al iniciar sesion
// correctamente, el servidor entrega un token que el navegador debe
// reenviar en cada peticion protegida (header "Authorization: Bearer
// <token>"). El servidor verifica la firma y la fecha de expiracion antes
// de dejar pasar la peticion. No hay estado que guardar en el servidor
// (no es una base de datos de sesiones): la firma es lo que garantiza que
// el token es autentico y no fue alterado.

const crypto = require('crypto');

const DURACION_TOKEN_MS = 12 * 60 * 60 * 1000; // 12 horas

function obtenerSecreto() {
  // SESSION_SECRET deberia configurarse en el .env; si no esta, se cae a
  // ADMIN_PASSWORD para no romper instalaciones existentes (pero lo ideal
  // es definir SESSION_SECRET aparte, ver .env.example).
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'cumbre-segura-secreto-temporal';
}

function firmar(texto) {
  return crypto.createHmac('sha256', obtenerSecreto()).update(texto).digest('base64url');
}

// Crea un token para el rol indicado ('admin' o 'colaborador'). Para
// colaborador se incluye tambien su id y nombre, para que las rutas que
// aceptan ambos roles sepan quien esta atendiendo una alerta, por ejemplo.
function generarToken(datos) {
  const payload = { ...datos, exp: Date.now() + DURACION_TOKEN_MS };
  const payloadTexto = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const firma = firmar(payloadTexto);
  return `${payloadTexto}.${firma}`;
}

// Verifica un token: retorna el payload si es valido, o null si la firma
// no coincide, esta corrupto, o ya expiro.
function verificarToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadTexto, firma] = token.split('.');
  const firmaEsperada = firmar(payloadTexto);

  // Comparacion en tiempo constante para no filtrar informacion por
  // temporizacion (timing attack) al comparar la firma.
  const bufA = Buffer.from(firma);
  const bufB = Buffer.from(firmaEsperada);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadTexto, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function extraerTokenDeHeader(req) {
  const encabezado = req.headers.authorization || '';
  const [tipo, token] = encabezado.split(' ');
  return tipo === 'Bearer' ? token : null;
}

module.exports = { generarToken, verificarToken, extraerTokenDeHeader };
