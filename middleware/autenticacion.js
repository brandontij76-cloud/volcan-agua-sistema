// middleware/autenticacion.js
//
// Middlewares que protegen las rutas de la API en el servidor (no solo en
// la pantalla del navegador). Se usan asi en cualquier archivo de rutas:
//
//   const { requiereAdmin } = require('../middleware/autenticacion');
//   router.delete('/:id', requiereAdmin, async (req, res) => { ... });
//
// Si el token falta, es invalido, o expiro, la peticion se corta aqui con
// 401 antes de que el codigo de la ruta llegue a tocar la base de datos.

const { verificarToken, extraerTokenDeHeader } = require('../services/autenticacion');

function requiereAdmin(req, res, next) {
  const token = extraerTokenDeHeader(req);
  const payload = verificarToken(token);
  if (!payload || payload.rol !== 'admin') {
    return res.status(401).json({ error: 'Sesion de administrador invalida o expirada. Inicia sesion de nuevo.' });
  }
  req.usuario = payload;
  next();
}

// Para rutas que tanto el administrador como un colaborador pueden usar
// (ver el mapa de tiempo real, atender alertas).
function requiereAdminOColaborador(req, res, next) {
  const token = extraerTokenDeHeader(req);
  const payload = verificarToken(token);
  if (!payload || (payload.rol !== 'admin' && payload.rol !== 'colaborador')) {
    return res.status(401).json({ error: 'Sesion invalida o expirada. Inicia sesion de nuevo.' });
  }
  req.usuario = payload;
  next();
}

module.exports = { requiereAdmin, requiereAdminOColaborador };
