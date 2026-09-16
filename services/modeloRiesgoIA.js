// services/modeloRiesgoIA.js
//
// MODELO DE MACHINE LEARNING PROPIO (para el capitulo de IA de la tesis).
//
// Se implementa una regresion logistica (algoritmo de clasificacion binaria
// clasico de ML supervisado) ENTRENADA DESDE CERO con descenso de gradiente,
// sin depender de ninguna libreria externa de ML. Esto permite explicar y
// defender exactamente como funciona el algoritmo, paso por paso:
//
//   1. Se toman los excursionistas ya registrados en Firebase como datos de
//      entrenamiento.
//   2. La "etiqueta" (lo que el modelo aprende a predecir) es si ese
//      recorrido tuvo o no alguna alerta.
//   3. Las "caracteristicas" (variables de entrada) son: hora de salida,
//      si es temporada lluviosa, y el tamano del grupo.
//   4. Se entrena una regresion logistica: encuentra los pesos que mejor
//      separan los recorridos "con alerta" de los "sin alerta".
//   5. Para un recorrido nuevo, el modelo calcula una probabilidad de
//      riesgo (0% a 100%) usando esos pesos aprendidos.
//
// IMPORTANTE PARA LA DEFENSA DE TESIS: con pocos datos historicos, el
// modelo va a tener baja confianza (se indica explicitamente con
// "muestraSuficiente: false"). Esto es normal y esperado en un sistema
// que recien empieza a operar: el modelo mejora conforme mas gente lo usa,
// porque tiene mas ejemplos reales de los cuales aprender.

const { obtenerParametrosSistema } = require('./configuracionSistema');

const MUESTRAS_MINIMAS_PARA_ENTRENAR = 10;
const TASA_APRENDIZAJE = 0.15;
const EPOCAS = 800;

// ---------------------------------------------------------------------
// Extraccion de caracteristicas (feature engineering)
// ---------------------------------------------------------------------
function horaANumero(horaTexto) {
  const [h, m] = (horaTexto || '06:00').split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
}

function esMesLluvioso(fecha) {
  const mes = fecha.getMonth() + 1; // 1-12, temporada lluviosa en Guatemala: mayo-octubre
  return mes >= 5 && mes <= 10 ? 1 : 0;
}

function extraerCaracteristicas({ horaSalidaEstimada, fechaRegistro, personasGrupo }) {
  const fecha = fechaRegistro ? new Date(fechaRegistro) : new Date();
  return [
    horaANumero(horaSalidaEstimada) / 24, // normalizado 0-1
    esMesLluvioso(fecha), // 0 o 1
    Math.min(personasGrupo || 1, 10) / 10, // normalizado 0-1 (tope en 10 personas)
  ];
}

// ---------------------------------------------------------------------
// Regresion logistica: entrenamiento con descenso de gradiente
// ---------------------------------------------------------------------
function sigmoide(z) {
  return 1 / (1 + Math.exp(-z));
}

function entrenarRegresionLogistica(caracteristicas, etiquetas) {
  const numCaracteristicas = caracteristicas[0].length;
  let pesos = new Array(numCaracteristicas).fill(0);
  let sesgo = 0;
  const n = caracteristicas.length;

  for (let epoca = 0; epoca < EPOCAS; epoca++) {
    const gradientesPesos = new Array(numCaracteristicas).fill(0);
    let gradienteSesgo = 0;

    for (let i = 0; i < n; i++) {
      const x = caracteristicas[i];
      const yReal = etiquetas[i];

      const z = pesos.reduce((suma, w, j) => suma + w * x[j], sesgo);
      const yPredicha = sigmoide(z);
      const error = yPredicha - yReal;

      for (let j = 0; j < numCaracteristicas; j++) {
        gradientesPesos[j] += error * x[j];
      }
      gradienteSesgo += error;
    }

    for (let j = 0; j < numCaracteristicas; j++) {
      pesos[j] -= (TASA_APRENDIZAJE * gradientesPesos[j]) / n;
    }
    sesgo -= (TASA_APRENDIZAJE * gradienteSesgo) / n;
  }

  return { pesos, sesgo };
}

function predecir({ pesos, sesgo }, x) {
  const z = pesos.reduce((suma, w, j) => suma + w * x[j], sesgo);
  return sigmoide(z);
}

// ---------------------------------------------------------------------
// Metricas de evaluacion (para poder mostrarlas en la tesis)
// ---------------------------------------------------------------------
function calcularMetricas(modelo, caracteristicas, etiquetas) {
  let verdaderosPositivos = 0;
  let falsosPositivos = 0;
  let verdaderosNegativos = 0;
  let falsosNegativos = 0;

  caracteristicas.forEach((x, i) => {
    const prediccion = predecir(modelo, x) >= 0.5 ? 1 : 0;
    const real = etiquetas[i];
    if (prediccion === 1 && real === 1) verdaderosPositivos++;
    else if (prediccion === 1 && real === 0) falsosPositivos++;
    else if (prediccion === 0 && real === 0) verdaderosNegativos++;
    else if (prediccion === 0 && real === 1) falsosNegativos++;
  });

  const total = caracteristicas.length;
  const exactitud = total > 0 ? (verdaderosPositivos + verdaderosNegativos) / total : null;
  const precision = (verdaderosPositivos + falsosPositivos) > 0
    ? verdaderosPositivos / (verdaderosPositivos + falsosPositivos)
    : null;
  const exhaustividad = (verdaderosPositivos + falsosNegativos) > 0
    ? verdaderosPositivos / (verdaderosPositivos + falsosNegativos)
    : null;

  return {
    exactitud: exactitud !== null ? Math.round(exactitud * 100) : null,
    precision: precision !== null ? Math.round(precision * 100) : null,
    exhaustividad: exhaustividad !== null ? Math.round(exhaustividad * 100) : null,
    matrizConfusion: { verdaderosPositivos, falsosPositivos, verdaderosNegativos, falsosNegativos },
  };
}

// ---------------------------------------------------------------------
// Entrenamiento reutilizable: separa el entrenamiento del modelo (que no
// depende de ningun recorrido en particular) de la prediccion para un
// recorrido nuevo especifico. Asi, tanto predecirRiesgoRecorrido como
// entrenarYRegistrarModelo (que ademas deja constancia en
// historial_entrenamiento_ia) reusan el mismo entrenamiento.
// ---------------------------------------------------------------------
async function entrenarModeloActual(db) {
  const [snapshotExcursionistas, snapshotAlertas] = await Promise.all([
    db.ref('excursionistas').once('value'),
    db.ref('alertas').once('value'),
  ]);

  const excursionistas = Object.values(snapshotExcursionistas.val() || {}).filter((e) => e.estado !== 'pendiente');
  const alertas = Object.values(snapshotAlertas.val() || {});
  const idsConAlerta = new Set(alertas.map((a) => a.excursionistaId));

  const totalMuestras = excursionistas.length;

  if (totalMuestras < MUESTRAS_MINIMAS_PARA_ENTRENAR) {
    return { muestraSuficiente: false, totalMuestras, muestrasMinimasRequeridas: MUESTRAS_MINIMAS_PARA_ENTRENAR };
  }

  const caracteristicas = excursionistas.map(extraerCaracteristicas);
  const etiquetas = excursionistas.map((e) => (idsConAlerta.has(e.id) ? 1 : 0));

  const modelo = entrenarRegresionLogistica(caracteristicas, etiquetas);
  const metricas = calcularMetricas(modelo, caracteristicas, etiquetas);

  return { muestraSuficiente: true, totalMuestras, modelo, metricas };
}

// ---------------------------------------------------------------------
// Punto de entrada: entrena con el historial de Firebase y predice
// para un recorrido nuevo.
// ---------------------------------------------------------------------
async function predecirRiesgoRecorrido(db, entradaNueva) {
  try {
    const entrenamiento = await entrenarModeloActual(db);

    if (!entrenamiento.muestraSuficiente) {
      return {
        muestraSuficiente: false,
        totalMuestras: entrenamiento.totalMuestras,
        muestrasMinimasRequeridas: entrenamiento.muestrasMinimasRequeridas,
        probabilidadRiesgo: null,
        metricas: null,
      };
    }

    const xNuevo = extraerCaracteristicas(entradaNueva);
    const probabilidad = predecir(entrenamiento.modelo, xNuevo);
    const probabilidadRiesgo = Math.round(probabilidad * 100);

    // 5.2.4 Modelo de negocio: traduce la probabilidad en una categoria
    // comprensible, usando el umbral configurable (parametros_sistema).
    const { umbralRiesgoAlto } = obtenerParametrosSistema();
    let categoriaRiesgo = 'bajo';
    if (probabilidadRiesgo >= umbralRiesgoAlto) categoriaRiesgo = 'alto';
    else if (probabilidadRiesgo >= umbralRiesgoAlto / 2) categoriaRiesgo = 'moderado';

    return {
      muestraSuficiente: true,
      totalMuestras: entrenamiento.totalMuestras,
      probabilidadRiesgo,
      categoriaRiesgo,
      metricas: entrenamiento.metricas,
      pesosAprendidos: entrenamiento.modelo.pesos.map((p) => Number(p.toFixed(4))),
      sesgoAprendido: Number(entrenamiento.modelo.sesgo.toFixed(4)),
    };
  } catch (error) {
    console.warn('[Modelo IA] No se pudo entrenar/predecir:', error.message);
    return { muestraSuficiente: false, totalMuestras: 0, probabilidadRiesgo: null, metricas: null, error: true };
  }
}

// ---------------------------------------------------------------------
// Entrena el modelo y deja constancia del resultado en el nodo
// historial_entrenamiento_ia: fecha, cantidad de registros usados, y las
// metricas de desempeño (exactitud, precision, sensibilidad, matriz de
// confusion). Se dispara explicitamente desde el panel administrativo
// ("Reentrenar modelo"), no en cada prediccion, para que el historial
// represente entrenamientos reales y no se llene de registros repetidos.
// ---------------------------------------------------------------------
async function entrenarYRegistrarModelo(db) {
  const entrenamiento = await entrenarModeloActual(db);

  const ref = db.ref('historial_entrenamiento_ia').push();
  const registro = {
    id: ref.key,
    fechaEntrenamiento: Date.now(),
    cantidadRegistros: entrenamiento.totalMuestras,
    muestraSuficiente: entrenamiento.muestraSuficiente,
    exactitud: entrenamiento.metricas?.exactitud ?? null,
    precision: entrenamiento.metricas?.precision ?? null,
    sensibilidad: entrenamiento.metricas?.exhaustividad ?? null,
    matrizConfusion: entrenamiento.metricas?.matrizConfusion ?? null,
  };
  await ref.set(registro);

  return registro;
}

async function obtenerHistorialEntrenamiento(db) {
  const snapshot = await db.ref('historial_entrenamiento_ia').once('value');
  const datos = snapshot.val() || {};
  return Object.values(datos).sort((a, b) => b.fechaEntrenamiento - a.fechaEntrenamiento);
}

module.exports = {
  extraerCaracteristicas,
  entrenarRegresionLogistica,
  predecir,
  calcularMetricas,
  predecirRiesgoRecorrido,
  entrenarYRegistrarModelo,
  obtenerHistorialEntrenamiento,
  MUESTRAS_MINIMAS_PARA_ENTRENAR,
};
