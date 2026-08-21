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

const { CIMA_VOLCAN_DE_AGUA, INFO_RUTA_VOLCAN_DE_AGUA } = require('./deteccionAnomalias');
const { predecirRiesgoRecorrido } = require('./modeloRiesgoIA');

const TIEMPO_LIMITE_MS = 6000; // clima (Open-Meteo es rapido)
const TIEMPO_LIMITE_GEMINI_MS = 45000; // Gemini puede tardar mas, sobre todo en el plan gratuito de Render

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

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Codigos de error que sabemos que son temporales del lado de Google
// (modelo saturado por demanda, o limite de uso momentaneo). Vale la
// pena reintentar. Otros errores (clave invalida, prompt bloqueado,
// modelo inexistente) no se arreglan reintentando.
const CODIGOS_REINTENTABLES = new Set([503, 429]);
const MAX_REINTENTOS_GEMINI = 2;

// ---------------------------------------------------------------------
// Funcion base: manda un prompt de texto a Gemini y regresa la respuesta.
// La reutilizan tanto el resumen automatico como el chatbot. Reintenta
// automaticamente si Gemini responde que esta saturado (503) o con
// limite de uso alcanzado (429), ya que Google mismo indica que esos
// picos de demanda suelen ser temporales.
// ---------------------------------------------------------------------
async function llamarGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const modelo = process.env.GEMINI_MODEL || 'gemini-flash-latest';

  for (let intento = 0; intento <= MAX_REINTENTOS_GEMINI; intento++) {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIEMPO_LIMITE_GEMINI_MS);
    const inicio = Date.now();

    try {
      const respuesta = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: controlador.signal,
        }
      );

      if (!respuesta.ok) {
        const cuerpoError = await respuesta.text().catch(() => '');
        const error = new Error(`Gemini respondio ${respuesta.status}: ${cuerpoError.slice(0, 300)}`);
        error.codigoHttp = respuesta.status;
        throw error;
      }

      const datos = await respuesta.json();
      const texto = datos.candidates?.[0]?.content?.parts?.[0]?.text;
      const bloqueado = datos.promptFeedback?.blockReason;
      if (!texto && bloqueado) {
        console.warn('[Asistente IA] Gemini bloqueo la respuesta:', bloqueado);
      }
      return texto ? texto.trim() : null;
    } catch (error) {
      const transcurridoMs = Date.now() - inicio;
      const fueTimeout = error.name === 'AbortError';
      const esReintentable = CODIGOS_REINTENTABLES.has(error.codigoHttp);
      const quedanIntentos = intento < MAX_REINTENTOS_GEMINI;

      console.warn(
        `[Asistente IA] Llamada a Gemini fallo tras ${transcurridoMs}ms` +
        (fueTimeout ? ' (se agoto el tiempo de espera de ' + TIEMPO_LIMITE_GEMINI_MS + 'ms)' : '') +
        `: ${error.message}` +
        (esReintentable && quedanIntentos ? ` -> reintentando (intento ${intento + 1}/${MAX_REINTENTOS_GEMINI})` : '')
      );

      if (esReintentable && quedanIntentos) {
        await esperar(1500 * (intento + 1)); // espera creciente: 1.5s, luego 3s
        continue;
      }

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

// ---------------------------------------------------------------------
// Google Gemini (capa gratuita) para redactar el mensaje final en
// lenguaje natural, combinando clima + riesgo del modelo de ML + reglas
// de equipo en un parrafo amigable, en vez de una lista fria de datos.
//
// Requiere la variable de entorno GEMINI_API_KEY (gratis, se obtiene en
// https://aistudio.google.com/apikey, sin tarjeta de credito).
//
// Si no esta configurada, o si la llamada falla, el sistema sigue
// funcionando normalmente con las recomendaciones en forma de lista
// (nunca depende de esto para funcionar).
// ---------------------------------------------------------------------
async function generarTextoConGemini({ clima, recomendaciones, riesgo, horaSalida }) {
  const climaTexto = clima.fuenteClima === 'api'
    ? `temperatura aproximada ${Math.round(clima.temperaturaC)}°C, ${clima.probabilidadLluvia}% de probabilidad de lluvia, viento ${Math.round(clima.vientoKmh)} km/h`
    : `clima estimado por temporada (${clima.temporada}), ~${clima.temperaturaC}°C`;

  const riesgoTexto = riesgo?.muestraSuficiente
    ? `el modelo de riesgo (entrenado con ${riesgo.totalMuestras} recorridos anteriores) estima ${riesgo.probabilidadRiesgo}% de probabilidad de que ocurra alguna alerta en este horario`
    : 'todavia no hay suficientes datos historicos para estimar un nivel de riesgo';

  const prompt =
    `Eres un asistente de senderismo para el Volcan de Agua en Guatemala. ` +
    `Un excursionista va a salir a las ${horaSalida || '06:00'}. Datos: ${climaTexto}. ${riesgoTexto}. ` +
    `Equipo recomendado: ${recomendaciones.join('; ')}. ` +
    `Escribe un parrafo corto (maximo 60 palabras), calido y directo en español de Guatemala, ` +
    `resumiendo esto para el excursionista. No uses markdown ni listas, solo texto plano.`;

  return llamarGemini(prompt);
}

// ---------------------------------------------------------------------
// Estado actual del modelo de ML (para mostrar en el panel administrativo,
// como evidencia de que el modelo esta realmente entrenado y funcionando).
// ---------------------------------------------------------------------
async function obtenerEstadoModelo(db) {
  const resultado = await predecirRiesgoRecorrido(db, {
    horaSalidaEstimada: '06:00',
    personasGrupo: 1,
    fechaRegistro: Date.now(),
  });
  return {
    muestraSuficiente: resultado.muestraSuficiente,
    totalMuestras: resultado.totalMuestras,
    muestrasMinimasRequeridas: resultado.muestrasMinimasRequeridas,
    metricas: resultado.metricas,
  };
}

// ---------------------------------------------------------------------
// CHATBOT: responde preguntas libres, tanto de excursionistas como del
// equipo administrativo. Al admin se le da contexto en vivo (cuantos
// excursionistas activos hay, alertas sin atender, estado del modelo)
// para que pueda preguntar cosas como "¿cuantas alertas hay pendientes?".
// ---------------------------------------------------------------------
async function construirContextoAdmin(db) {
  try {
    const [snapshotExcursionistas, snapshotAlertas, estadoModelo] = await Promise.all([
      db.ref('excursionistas').once('value'),
      db.ref('alertas').once('value'),
      obtenerEstadoModelo(db),
    ]);

    const excursionistas = Object.values(snapshotExcursionistas.val() || {});
    const alertas = Object.values(snapshotAlertas.val() || {});

    const activos = excursionistas.filter((e) => e.estado === 'activo').length;
    const sinAtender = alertas.filter((a) => !a.atendida).length;
    const cimasAlcanzadas = excursionistas.filter((e) => e.cumbreAlcanzada).length;

    const modeloTexto = estadoModelo.muestraSuficiente
      ? `entrenado con ${estadoModelo.totalMuestras} recorridos, ${estadoModelo.metricas.exactitud}% de exactitud`
      : `aun sin suficientes datos para entrenar (tiene ${estadoModelo.totalMuestras}, necesita minimo ${estadoModelo.muestrasMinimasRequeridas})`;

    return (
      `Eres el asistente interno de "Cumbre Segura", el sistema de la Municipalidad de Santa Maria de Jesus ` +
      `para monitorear excursionistas del Volcan de Agua. Hablas con un miembro del equipo administrativo. ` +
      `Datos actuales del sistema: ${excursionistas.length} excursionistas registrados en total, ${activos} activos ahorita, ` +
      `${sinAtender} alertas sin atender, ${cimasAlcanzadas} personas han confirmado llegar a la cima. ` +
      `El modelo de Machine Learning de riesgo esta ${modeloTexto}. ` +
      `Responde de forma breve y profesional, en español. Si preguntan algo que no esta en estos datos, ` +
      `dilo con honestidad y ofrece explicar como funciona esa parte del sistema en general.`
    );
  } catch (error) {
    console.warn('[Asistente IA] No se pudo construir contexto de admin:', error.message);
    return (
      `Eres el asistente interno de "Cumbre Segura" (sistema municipal para el Volcan de Agua). ` +
      `No se pudo cargar el estado actual de la base de datos. Responde de forma breve y profesional, ` +
      `explicando como funciona el sistema en general si preguntan.`
    );
  }
}

function construirContextoUsuario() {
  return (
    `Eres el asistente de "Cumbre Segura" para excursionistas que van a subir al Volcan de Agua, Guatemala. ` +
    `Datos de la ruta: ${INFO_RUTA_VOLCAN_DE_AGUA.distanciaKm} km, ${INFO_RUTA_VOLCAN_DE_AGUA.desnivelM} m de desnivel, ` +
    `dificultad "${INFO_RUTA_VOLCAN_DE_AGUA.dificultad}". El sistema permite registrarse, compartir ubicacion GPS ` +
    `en tiempo real, presionar un boton de emergencia, confirmar la llegada a la cima, y finalizar el recorrido. ` +
    `Responde dudas sobre el recorrido, que llevar, seguridad, clima o el uso del sistema. Se breve, calido, ` +
    `en español de Guatemala. Si preguntan algo fuera de este tema, redirige amablemente al tema del recorrido.`
  );
}

async function responderChat(db, { pregunta, contexto, historial }) {
  if (!pregunta || !pregunta.trim()) {
    return { respuesta: '¿En qué te puedo ayudar?', generadoConIA: false };
  }

  if (!process.env.GEMINI_API_KEY) {
    return {
      respuesta:
        'El chat con IA todavía no está activado en este sistema (falta configurar GEMINI_API_KEY). ' +
        'Mientras tanto, puedes usar el formulario de registro o el panel administrativo directamente.',
      generadoConIA: false,
    };
  }

  const contextoSistema = contexto === 'admin'
    ? await construirContextoAdmin(db)
    : construirContextoUsuario();

  const historialTexto = (historial || [])
    .slice(-6) // solo los ultimos intercambios, para no alargar el prompt de mas
    .map((h) => `${h.rol === 'usuario' ? 'Persona' : 'Asistente'}: ${h.texto}`)
    .join('\n');

  const prompt =
    `${contextoSistema}\n\n` +
    (historialTexto ? `Conversacion previa:\n${historialTexto}\n\n` : '') +
    `Pregunta nueva de la persona: ${pregunta}\n\n` +
    `Responde solo la pregunta nueva, en texto plano, maximo 80 palabras.`;

  const respuestaTexto = await llamarGemini(prompt);

  if (!respuestaTexto) {
    return {
      respuesta: 'No pude generar una respuesta en este momento. Intenta de nuevo en unos segundos.',
      generadoConIA: false,
    };
  }

  return { respuesta: respuestaTexto, generadoConIA: true };
}

// ---------------------------------------------------------------------
// Punto de entrada: junta todo en una sola respuesta
// ---------------------------------------------------------------------
async function generarSugerenciaCompleta(db, { horaSalida, fecha, personasGrupo }) {
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
  const riesgo = await predecirRiesgoRecorrido(db, {
    horaSalidaEstimada: horaSalida,
    personasGrupo,
    fechaRegistro: fechaBase.getTime(),
  });
  const textoGemini = await generarTextoConGemini({ clima, recomendaciones, riesgo, horaSalida });

  return {
    clima,
    recomendaciones,
    estadisticaHistorica,
    riesgo,
    textoGemini,
  };
}

module.exports = {
  obtenerPronosticoClima,
  climaEstacionalDeRespaldo,
  generarRecomendacionesEquipo,
  calcularEstadisticasHistoricas,
  generarTextoConGemini,
  generarSugerenciaCompleta,
  obtenerEstadoModelo,
  responderChat,
};
