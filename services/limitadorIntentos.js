// services/limitadorIntentos.js
//
// Limita cuantos intentos fallidos de login se permiten por IP en una
// ventana de tiempo, para que nadie pueda "adivinar" una contrasena
// probando miles de combinaciones seguidas contra /api/admin/login o
// /api/colaboradores/login. Es una proteccion en memoria (no necesita
// base de datos ni dependencias externas); si el servidor se reinicia,
// los contadores se reinician tambien, lo cual es aceptable para el
// alcance de este proyecto.

const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const MAXIMO_INTENTOS = 8;

const intentosPorClave = new Map(); // clave (ip+ruta) -> { cuenta, desde }

function limpiarExpirados() {
  const ahora = Date.now();
  intentosPorClave.forEach((valor, clave) => {
    if (ahora - valor.desde > VENTANA_MS) intentosPorClave.delete(clave);
  });
}

// Middleware de Express: se coloca antes del handler de login. No bloquea
// la primera peticion; cuenta los intentos y corta cuando se pasa del
// maximo dentro de la ventana de tiempo.
function limitarIntentos(nombreRuta) {
  return (req, res, next) => {
    limpiarExpirados();

    const ip = req.ip || req.connection?.remoteAddress || 'desconocida';
    const clave = `${nombreRuta}:${ip}`;
    const ahora = Date.now();

    let registro = intentosPorClave.get(clave);
    if (!registro || ahora - registro.desde > VENTANA_MS) {
      registro = { cuenta: 0, desde: ahora };
    }

    if (registro.cuenta >= MAXIMO_INTENTOS) {
      const minutosRestantes = Math.ceil((VENTANA_MS - (ahora - registro.desde)) / 60000);
      return res.status(429).json({
        error: `Demasiados intentos. Espera ${minutosRestantes} minuto(s) antes de volver a intentar.`,
      });
    }

    registro.cuenta += 1;
    intentosPorClave.set(clave, registro);
    next();
  };
}

module.exports = { limitarIntentos };
