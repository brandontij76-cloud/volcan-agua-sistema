// services/asistenteIA.js
//
// Este es el componente de "inteligencia artificial" descrito en el
// capitulo III del proyecto. Se implementa de forma honesta y verificable
// (nada de humo): combina 3 fuentes de informacion reales para dar una
// recomendacion util al excursionista antes de subir:
//
//   1. CLIMA REAL: se consulta la API publica y gratuita de Open-Meteo
//      (no requiere llave ni cuenta) para el punto mas alto del recorrido,
//      en la fecha/hora de salida que la persona indico.
//   2. REGLAS DE EQUIPO: un motor de reglas que cruza clima + hora de
//      salida + epoca del anio (seca/lluviosa en Guatemala) para sugerir
//      que llevar.
//   3. APRENDIZAJE DE DATOS HISTORICOS: se consulta el propio historial de
//      excursionistas y alertas guardado en Firebase para calcular, por
//      franja horaria de salida, que tan seguido ha habido alguna alerta.
//      Mientras mas gente registre su recorrido, mas preciso se vuelve
//      este calculo (es aprendizaje basado en datos reales acumulados, no
//      una red neuronal entrenada, que requeriria muchos mas datos de los
//      que un sistema municipal como este va a acumular en el corto plazo).
//
// Si la API de clima no responde (sin internet, servicio caido, etc.), el
// sistema no se cae: usa reglas estacionales genericas como respaldo, y lo
// indica claramente en la respuesta (fuenteClima: 'api' | 'estacional').

const { CIMA_VOLCAN_DE_AGUA } = require('./deteccionAnomalias');

const TIEMPO_LIMITE_MS = 6000;

// ---------------------------------------------------------------------
// 1) Clima real (Open-Meteo, gratuito, sin llave)
// ---------------------------------------------------------------------
async function obtenerPronosticoClima(fechaHoraISO) {
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_MS);

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${CIMA_VOLCAN_DE_AGUA.lat}&longitude=${CIMA_VOLCAN_DE_AGUA.lng}` +
      `&hourly=temperature_2m,precipitation_probability,windspeed_10m,cloudcover` +
      `&timezone=America%2FGuatemala`;

    const respuesta = await fetch(url, { signal: controlador.signal });
    if (!respuesta.ok) throw new Error(`Open-Meteo respondio ${respuesta.status}`);

    const datos = await respuesta.json();
    const horas = datos.hourly?.time || [];

    // Buscar el indice de la hora mas cercana a la solicitada.
    const objetivo = new Date(fechaHoraISO).getTime();
    let mejorIndice = 0;
    let mejorDiferencia = Infinity;
    horas.forEach((horaTexto, indice) => {
      const diferencia = Math.abs(new Date(horaTexto).getTime() - objetivo);
      if (diferencia < mejorDiferencia) {
        mejorDiferencia = diferencia;
        mejorIndice = indice;
      }
    });

    if (horas.length === 0) throw new Error('Open-Meteo no devolvio datos por hora.');

    return {
      fuenteClima: 'api',
      temperaturaC: datos.hourly.temperature_2m[mejorIndice],
      probabilidadLluvia: datos.hourly.precipitation_probability[mejorIndice],
      vientoKmh: datos.hourly.windspeed_10m[mejorIndice],
      nubosidad: datos.hourly.cloudcover[mejorIndice],
    };
  } catch (error) {
    console.warn('[Asistente IA] No se pudo obtener clima real, se usan reglas estacionales:', error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------
// Respaldo: reglas estacionales de Guatemala si la API de clima falla.
// ---------------------------------------------------------------------
function climaEstacionalDeRespaldo(fecha) {
  const mes = fecha.getMonth() + 1; // 1-12
  const esTemporadaLluviosa = mes >= 5 && mes <= 10;

  return {
    fuenteClima: 'estacional',
    temporada: esTemporadaLluviosa ? 'lluviosa' : 'seca',
    // Rangos tipicos de referencia para la zona (no es un dato medido, es
    // una aproximacion generica cuando no hay conexion a la API de clima).
    temperaturaC: esTemporadaLluviosa ? 14 : 11,
    probabilidadLluvia: esTemporadaLluviosa ? 65 : 15,
    vientoKmh: 20,
    nubosidad: esTemporadaLluviosa ? 70 : 30,
  };
}

// ---------------------------------------------------------------------
// 2) Motor de reglas: recomendaciones de equipo y suministros
// ---------------------------------------------------------------------
function generarRecomendacionesEquipo({ horaSalida, clima }) {
  const recomendaciones = [];
  const horaNumero = parseInt((horaSalida || '06:00').split(':')[0], 10);

  // Base, siempre.
  recomendaciones.push('Mínimo 2 litros de agua por persona.');
  recomendaciones.push('Botas o zapatos con buen agarre para terreno volcánico.');
  recomendaciones.push('Snacks energéticos (frutas secas, barras, panes).');

  // Temperatura.
  if (clima.temperaturaC <= 12) {
    recomendaciones.push('Ropa abrigada en capas: la cima puede estar varios grados más fría que el pueblo.');
  }
  if (clima.temperaturaC <= 8) {
    recomendaciones.push('Gorro, guantes y bufanda: temperatura baja esperada en la cima.');
  }

  // Lluvia.
  if (clima.probabilidadLluvia >= 60) {
    recomendaciones.push('Impermeable o poncho: alta probabilidad de lluvia durante el recorrido.');
    recomendaciones.push('Bolsas plásticas para proteger celular, documentos y cámara.');
  } else if (clima.probabilidadLluvia >= 30) {
    recomendaciones.push('Lleva un impermeable ligero por si acaso; hay posibilidad moderada de lluvia.');
  }

  // Viento.
  if (clima.vientoKmh >= 30) {
    recomendaciones.push('Rompevientos: se esperan rachas de viento fuertes en la parte alta.');
  }

  // Nubosidad / neblina.
  if (clima.nubosidad >= 70) {
    recomendaciones.push('Neblina probable en la parte alta: no te separes del grupo y mantén tu ubicación GPS activa.');
  }

  // Hora de salida.
  if (horaNumero < 6) {
    recomendaciones.push('Linterna frontal o de mano: saldrás antes del amanecer.');
  }
  if (horaNumero >= 13) {
    recomendaciones.push('Salida tardía: calcula bien el tiempo para no bajar de noche, o lleva linterna por si acaso.');
  }

  // Siempre al final.
  recomendaciones.push('Protector solar y lentes de sol (la radiación es más fuerte en altura, incluso nublado).');
  recomendaciones.push('Botiquín básico y el teléfono con buena carga de batería.');

  return recomendaciones;
}

// ---------------------------------------------------------------------
// 3) Aprendizaje a partir del historial guardado (Firebase)
// ---------------------------------------------------------------------
function franjaHoraria(horaTexto) {
  const h = parseInt((horaTexto || '').split(':')[0], 10);
  if (Number.isNaN(h)) return null;
  if (h >= 4 && h < 8) return 'madrugada (4:00-7:59)';
  if (h >= 8 && h < 12) return 'mañana (8:00-11:59)';
  if (h >= 12 && h < 16) return 'mediodía (12:00-15:59)';
  return 'tarde/noche (16:00+)';
}

async function calcularEstadisticasHistoricas(db, horaSalida) {
  try {
    const franjaConsultada = franjaHoraria(horaSalida);
    if (!franjaConsultada) return null;

    const [snapshotExcursionistas, snapshotAlertas] = await Promise.all([
      db.ref('excursionistas').once('value'),
      db.ref('alertas').once('value'),
    ]);

    const excursionistas = Object.values(snapshotExcursionistas.val() || {});
    const alertas = Object.values(snapshotAlertas.val() || {});

    const idsConAlerta = new Set(alertas.map((a) => a.excursionistaId));

    const enEstaFranja = excursionistas.filter(
      (e) => franjaHoraria(e.horaSalidaEstimada) === franjaConsultada
    );

    if (enEstaFranja.length < 5) {
      // Muy pocos datos todavia para que la estadistica sea confiable.
      return {
        franja: franjaConsultada,
        muestraSuficiente: false,
        totalRegistros: enEstaFranja.length,
      };
    }

    const conAlerta = enEstaFranja.filter((e) => idsConAlerta.has(e.id)).length;
    const porcentaje = Math.round((conAlerta / enEstaFranja.length) * 100);

    return {
      franja: franjaConsultada,
      muestraSuficiente: true,
      totalRegistros: enEstaFranja.length,
      porcentajeConAlerta: porcentaje,
    };
  } catch (error) {
    console.warn('[Asistente IA] No se pudo calcular estadistica historica:', error.message);
    return null;
  }
}

// ---------------------------------------------------------------------
// Punto de entrada: junta todo en una sola respuesta
// ---------------------------------------------------------------------
async function generarSugerenciaCompleta(db, { horaSalida, fecha }) {
  const fechaBase = fecha ? new Date(fecha) : new Date();
  const [horas, minutos] = (horaSalida || '06:00').split(':').map(Number);
  const fechaHoraSalida = new Date(fechaBase);
  fechaHoraSalida.setHours(horas || 6, minutos || 0, 0, 0);

  let clima = await obtenerPronosticoClima(fechaHoraSalida.toISOString());
  if (!clima) {
    clima = climaEstacionalDeRespaldo(fechaBase);
  }

  const recomendaciones = generarRecomendacionesEquipo({ horaSalida, clima });
  const estadisticaHistorica = await calcularEstadisticasHistoricas(db, horaSalida);

  return {
    clima,
    recomendaciones,
    estadisticaHistorica,
  };
}

module.exports = {
  obtenerPronosticoClima,
  climaEstacionalDeRespaldo,
  generarRecomendacionesEquipo,
  calcularEstadisticasHistoricas,
  generarSugerenciaCompleta,
};
