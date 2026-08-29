// services/estadisticas.js
//
// Calcula el resumen semanal que pide la jefatura de turismo municipal:
// cuantos se registraron, cuantos llegaron a la cima, cuantos no terminaron
// o se desviaron de la ruta (generaron alerta), y si esas alertas ya fueron
// atendidas y por quien.

const UNA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

async function calcularEstadisticasSemanales(db) {
  const [snapExc, snapAlertas] = await Promise.all([
    db.ref('excursionistas').once('value'),
    db.ref('alertas').once('value'),
  ]);

  const excursionistas = Object.values(snapExc.val() || {}).filter((e) => e.estado !== 'pendiente');
  const alertas = Object.values(snapAlertas.val() || {});

  const ahora = Date.now();
  const desde = ahora - UNA_SEMANA_MS;

  const excursionistasSemana = excursionistas.filter((e) => (e.fechaRegistro || 0) >= desde);
  const alertasSemana = alertas.filter((a) => (a.timestamp || 0) >= desde);

  const totalRegistrados = excursionistasSemana.length;
  const cimaAlcanzada = excursionistasSemana.filter((e) => e.cumbreAlcanzada).length;
  const finalizados = excursionistasSemana.filter((e) => e.estado === 'finalizado').length;
  const activos = excursionistasSemana.filter((e) => e.estado === 'activo').length;
  const sinTerminarODesviados = excursionistasSemana.filter(
    (e) => e.estado === 'activo' && !e.cumbreAlcanzada
  ).length;

  const alertasAtendidas = alertasSemana.filter((a) => a.atendida);
  const alertasSinAtender = alertasSemana.filter((a) => !a.atendida);

  const atendidasPorColaborador = alertasAtendidas.map((a) => ({
    excursionista: a.excursionistaNombre || null,
    nivel: a.nivel || null,
    atendidaPor: a.atendidaPor || 'No especificado',
    fechaAtencion: a.fechaAtencion || null,
  }));

  return {
    desde,
    hasta: ahora,
    totalRegistrados,
    cimaAlcanzada,
    finalizados,
    activos,
    sinTerminarODesviados,
    totalAlertas: alertasSemana.length,
    alertasAtendidas: alertasAtendidas.length,
    alertasSinAtender: alertasSinAtender.length,
    detalleAtencion: atendidasPorColaborador,
  };
}

module.exports = { calcularEstadisticasSemanales };
