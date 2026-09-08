// services/estadisticas.js
//
// Calcula el resumen semanal que pide la jefatura de turismo municipal:
// cuantos se registraron, cuantos llegaron a la cima, cuantos no terminaron
// o se desviaron de la ruta (generaron alerta), y si esas alertas ya fueron
// atendidas y por quien.
//
// Dos formas de calcularlo:
//   - calcularEstadisticasSemanales: ventana movil de los ultimos 7 dias
//     (la que ya usaban las tarjetas del panel administrativo).
//   - calcularEstadisticasSemanaCalendario: semana de calendario real
//     (lunes 00:00 a domingo 23:59), la que usa el reporte semanal con IA.

const UNA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

// Calculo compartido: dado un rango [desde, hasta], arma el mismo resumen
// que antes solo se calculaba para la ventana movil de 7 dias.
async function calcularEstadisticasEnRango(db, desde, hasta) {
  const [snapExc, snapAlertas] = await Promise.all([
    db.ref('excursionistas').once('value'),
    db.ref('alertas').once('value'),
  ]);

  const excursionistas = Object.values(snapExc.val() || {}).filter((e) => e.estado !== 'pendiente');
  const alertas = Object.values(snapAlertas.val() || {});

  const excursionistasSemana = excursionistas.filter(
    (e) => (e.fechaRegistro || 0) >= desde && (e.fechaRegistro || 0) <= hasta
  );
  const alertasSemana = alertas.filter((a) => (a.timestamp || 0) >= desde && (a.timestamp || 0) <= hasta);

  const totalRegistrados = excursionistasSemana.length;
  const cimaAlcanzada = excursionistasSemana.filter((e) => e.cumbreAlcanzada).length;
  const finalizados = excursionistasSemana.filter((e) => e.estado === 'finalizado').length;
  const activos = excursionistasSemana.filter((e) => e.estado === 'activo').length;
  const sinTerminarODesviados = excursionistasSemana.filter(
    (e) => e.estado === 'activo' && !e.cumbreAlcanzada
  ).length;

  const alertasAtendidas = alertasSemana.filter((a) => a.atendida);
  const alertasSinAtender = alertasSemana.filter((a) => !a.atendida);
  const alertasPorNivel = { leve: 0, moderada: 0, grave: 0 };
  alertasSemana.forEach((a) => {
    if (alertasPorNivel[a.nivel] != null) alertasPorNivel[a.nivel] += 1;
  });

  const atendidasPorColaborador = alertasAtendidas.map((a) => ({
    excursionista: a.excursionistaNombre || null,
    nivel: a.nivel || null,
    atendidaPor: a.atendidaPor || 'No especificado',
    fechaAtencion: a.fechaAtencion || null,
  }));

  return {
    desde,
    hasta,
    totalRegistrados,
    cimaAlcanzada,
    finalizados,
    activos,
    sinTerminarODesviados,
    totalAlertas: alertasSemana.length,
    alertasAtendidas: alertasAtendidas.length,
    alertasSinAtender: alertasSinAtender.length,
    alertasPorNivel,
    detalleAtencion: atendidasPorColaborador,
  };
}

// Ventana movil: "los ultimos 7 dias desde ahora" (la que ya usaban las
// tarjetas de la pestaña Estadisticas).
async function calcularEstadisticasSemanales(db) {
  const ahora = Date.now();
  return calcularEstadisticasEnRango(db, ahora - UNA_SEMANA_MS, ahora);
}

// Rango de la semana de calendario (lunes 00:00 a domingo 23:59:59) que
// contiene la fecha de referencia dada. offsetSemanas permite pedir la
// semana anterior (-1), la actual (0), etc.
function obtenerRangoSemanaCalendario(fechaReferencia = new Date(), offsetSemanas = 0) {
  const diaSemana = fechaReferencia.getDay(); // 0=domingo, 1=lunes, ... 6=sabado
  const diferenciaHastaLunes = diaSemana === 0 ? -6 : 1 - diaSemana;

  const lunes = new Date(fechaReferencia);
  lunes.setHours(0, 0, 0, 0);
  lunes.setDate(lunes.getDate() + diferenciaHastaLunes + offsetSemanas * 7);

  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  domingo.setHours(23, 59, 59, 999);

  return { desde: lunes.getTime(), hasta: domingo.getTime() };
}

// Estadisticas de la semana de calendario actual (lunes-domingo), mas la
// semana anterior para poder comparar tendencia. Es lo que consume el
// reporte semanal generado por IA.
async function calcularEstadisticasSemanaCalendario(db, offsetSemanas = 0) {
  const rango = obtenerRangoSemanaCalendario(new Date(), offsetSemanas);
  const estadisticas = await calcularEstadisticasEnRango(db, rango.desde, rango.hasta);
  return { ...estadisticas, esSemanaCalendario: true };
}

module.exports = {
  calcularEstadisticasSemanales,
  calcularEstadisticasSemanaCalendario,
  obtenerRangoSemanaCalendario,
};
