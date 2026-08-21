// services/clasificadorPreguntas.js
//
// RESPALDO DE MACHINE LEARNING PARA EL CHATBOT (capitulo de IA de la tesis).
//
// Cuando Gemini no esta disponible (saturado, sin cuota, sin internet), el
// chatbot NO debe simplemente fallar. En vez de eso, este modulo clasifica
// la pregunta de la persona usando un CLASIFICADOR NAIVE BAYES MULTINOMIAL
// (algoritmo clasico de ML supervisado para texto) ENTRENADO DESDE CERO,
// sin depender de ninguna libreria externa de ML ni de la nube.
//
// Como funciona (para la defensa de tesis):
//   1. Se define un conjunto de EJEMPLOS DE ENTRENAMIENTO: frases reales
//      que una persona podria escribir, ya etiquetadas con su categoria
//      (clima, equipo, ruta, emergencia, registro_uso, saludo).
//   2. Se "tokeniza" cada frase (se separa en palabras, sin tildes, en
//      minusculas) y se cuenta cuantas veces aparece cada palabra en
//      cada categoria. Esto es el "entrenamiento": el modelo aprende que
//      palabras estan asociadas a que categoria.
//   3. Para una pregunta nueva, se calcula -usando el Teorema de Bayes y
//      la suposicion "naive" (ingenua) de que las palabras son
//      independientes entre si- la probabilidad de que pertenezca a cada
//      categoria, y se escoge la de mayor probabilidad.
//   4. Se usa suavizado de Laplace (+1) para que una palabra nunca vista
//      no arruine el calculo con una probabilidad de cero.
//
// Este modelo es intencionalmente simple (Naive Bayes, no una red
// neuronal): con el numero de categorias y ejemplos de este proyecto,
// es el algoritmo correcto -rapido, explicable, sin necesidad de miles
// de datos de entrenamiento- y es perfectamente defendible como
// aprendizaje automatico real en la tesis.

// ---------------------------------------------------------------------
// 1) Datos de entrenamiento: frases reales etiquetadas por categoria
// ---------------------------------------------------------------------
const EJEMPLOS_ENTRENAMIENTO = {
  clima: [
    'como esta el clima',
    'va a llover',
    'que clima hace en la cima',
    'hace frio en el volcan',
    'cual es la temperatura',
    'hay neblina',
    'esta nublado',
    'que tiempo va a hacer',
    'llovera hoy',
    'hace viento',
    'como va a estar el clima manana',
    'esta soleado',
  ],
  equipo: [
    'que debo llevar',
    'que equipo necesito',
    'que ropa llevo',
    'necesito abrigo',
    'que zapatos uso',
    'que llevo de comer',
    'debo llevar agua',
    'que necesito para subir',
    'que cosas debo empacar',
    'necesito linterna',
    'que llevar para el frio',
    'recomendaciones de equipo',
  ],
  ruta: [
    'cuanto dura el recorrido',
    'cuantos kilometros son',
    'que tan dificil es la ruta',
    'cual es la distancia',
    'cuanto desnivel tiene',
    'cuanto se tarda en subir',
    'que tan largo es el camino',
    'a que hora debo salir',
    'cual es el nivel de dificultad',
    'cuantas horas toma llegar a la cima',
    'que tan lejos esta la cima',
  ],
  emergencia: [
    'que hace el boton de panico',
    'que pasa si me pierdo',
    'me perdi ayudenme',
    'estoy perdido necesito ayuda',
    'me extravie en el camino',
    'como pido ayuda',
    'auxilio',
    'necesito auxilio',
    'que hago en una emergencia',
    'que pasa si me lastimo',
    'me lastime que hago',
    'como funciona el boton de emergencia',
    'que pasa si me desvio de la ruta',
    'hay ayuda si me pasa algo',
    'que pasa si me quedo sin bateria',
    'como reporto un accidente',
    'no encuentro el camino de regreso',
  ],
  registro_uso: [
    'como me registro',
    'como uso el sistema',
    'como confirmo que llegue a la cima',
    'como funciona el gps',
    'como finalizo el recorrido',
    'necesito crear una cuenta',
    'como comparto mi ubicacion',
    'como se usa la aplicacion',
    'donde me registro',
    'como se cuando termino el recorrido',
  ],
  saludo: [
    'hola',
    'buenas',
    'buenos dias',
    'gracias',
    'muchas gracias',
    'que tal',
    'adios',
    'hasta luego',
    'ok gracias',
  ],
};

// ---------------------------------------------------------------------
// 2) Tokenizacion: minusculas, sin tildes, solo palabras
// ---------------------------------------------------------------------
function normalizarTexto(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita tildes/acentos
}

// Palabras muy comunes en español que aparecen por igual en casi todas
// las categorias y no aportan informacion util para distinguir el tema
// de la pregunta (si se dejaran, contaminarian la clasificacion: por
// ejemplo "cual es..." aparece tanto en preguntas de ruta como en
// preguntas de cualquier otro tema).
const PALABRAS_VACIAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al',
  'que', 'cual', 'cuales', 'quien', 'quienes', 'como', 'cuando', 'donde',
  'es', 'son', 'esta', 'estan', 'hay', 'hace', 'ser', 'estar', 'tener',
  'yo', 'tu', 'el', 'ella', 'nosotros', 'ustedes', 'ellos', 'mi', 'me',
  'se', 'lo', 'le', 'les', 'su', 'sus', 'y', 'o', 'a', 'en', 'por', 'para',
  'con', 'sin', 'si', 'no', 'pero', 'mas', 'muy', 'este', 'esta', 'eso',
]);

function tokenizar(texto) {
  return normalizarTexto(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((palabra) => palabra.length > 0 && !PALABRAS_VACIAS.has(palabra));
}

// ---------------------------------------------------------------------
// 3) Entrenamiento: contar palabras por categoria (se hace una sola vez,
//    al cargar el modulo, ya que los ejemplos de entrenamiento son fijos)
// ---------------------------------------------------------------------
function entrenarNaiveBayes(ejemplosPorCategoria) {
  const categorias = Object.keys(ejemplosPorCategoria);
  const conteoPalabrasPorCategoria = {}; // categoria -> { palabra: conteo }
  const totalPalabrasPorCategoria = {}; // categoria -> total de palabras
  const totalDocumentosPorCategoria = {}; // categoria -> num de frases de ejemplo
  const vocabulario = new Set();
  let totalDocumentos = 0;

  categorias.forEach((categoria) => {
    conteoPalabrasPorCategoria[categoria] = {};
    totalPalabrasPorCategoria[categoria] = 0;
    const frases = ejemplosPorCategoria[categoria];
    totalDocumentosPorCategoria[categoria] = frases.length;
    totalDocumentos += frases.length;

    frases.forEach((frase) => {
      tokenizar(frase).forEach((palabra) => {
        vocabulario.add(palabra);
        conteoPalabrasPorCategoria[categoria][palabra] =
          (conteoPalabrasPorCategoria[categoria][palabra] || 0) + 1;
        totalPalabrasPorCategoria[categoria] += 1;
      });
    });
  });

  return {
    categorias,
    conteoPalabrasPorCategoria,
    totalPalabrasPorCategoria,
    totalDocumentosPorCategoria,
    totalDocumentos,
    tamanoVocabulario: vocabulario.size,
  };
}

// Se entrena una sola vez cuando el servidor arranca (los ejemplos son
// constantes en el codigo, no cambian en tiempo de ejecucion).
const MODELO_ENTRENADO = entrenarNaiveBayes(EJEMPLOS_ENTRENAMIENTO);

// Vocabulario global (todas las palabras vistas en el entrenamiento, sin
// importar la categoria). Se usa para detectar si una pregunta nueva
// esta completamente fuera de los temas que el modelo conoce.
const VOCABULARIO_GLOBAL = new Set();
Object.values(MODELO_ENTRENADO.conteoPalabrasPorCategoria).forEach((conteoPalabras) => {
  Object.keys(conteoPalabras).forEach((palabra) => VOCABULARIO_GLOBAL.add(palabra));
});

// ---------------------------------------------------------------------
// 4) Clasificacion: Teorema de Bayes con suposicion "naive" de
//    independencia entre palabras, en espacio logaritmico (para evitar
//    que el producto de muchas probabilidades pequenas llegue a cero).
// ---------------------------------------------------------------------
function clasificarPregunta(pregunta) {
  const palabras = tokenizar(pregunta);
  const modelo = MODELO_ENTRENADO;

  if (palabras.length === 0) {
    return { categoria: 'desconocido', confianza: 0 };
  }

  // Cobertura: cuantas de las palabras de la pregunta se vieron durante
  // el entrenamiento (en cualquier categoria). Si ninguna palabra es
  // reconocida, la pregunta esta fuera de los temas que el modelo
  // conoce y es mas honesto admitirlo que forzar una categoria al azar.
  const palabrasConocidas = palabras.filter((palabra) => VOCABULARIO_GLOBAL.has(palabra));
  if (palabrasConocidas.length === 0) {
    return { categoria: 'desconocido', confianza: 0 };
  }

  const puntajesPorCategoria = {};

  modelo.categorias.forEach((categoria) => {
    // Probabilidad previa (prior): que tan comun es esta categoria en
    // los ejemplos de entrenamiento.
    const prior = modelo.totalDocumentosPorCategoria[categoria] / modelo.totalDocumentos;
    let logProbabilidad = Math.log(prior);

    palabras.forEach((palabra) => {
      const conteoPalabra = modelo.conteoPalabrasPorCategoria[categoria][palabra] || 0;
      // Suavizado de Laplace (+1) para palabras nunca vistas en esta categoria.
      const probabilidadPalabra =
        (conteoPalabra + 1) / (modelo.totalPalabrasPorCategoria[categoria] + modelo.tamanoVocabulario);
      logProbabilidad += Math.log(probabilidadPalabra);
    });

    puntajesPorCategoria[categoria] = logProbabilidad;
  });

  // La categoria ganadora es la de mayor log-probabilidad.
  let mejorCategoria = 'desconocido';
  let mejorPuntaje = -Infinity;
  modelo.categorias.forEach((categoria) => {
    if (puntajesPorCategoria[categoria] > mejorPuntaje) {
      mejorPuntaje = puntajesPorCategoria[categoria];
      mejorCategoria = categoria;
    }
  });

  // Convertir los log-puntajes a una "confianza" 0-1 normalizada
  // (softmax), solo para tener un numero interpretable.
  const puntajes = Object.values(puntajesPorCategoria);
  const maximo = Math.max(...puntajes);
  const sumaExponenciales = puntajes.reduce((suma, p) => suma + Math.exp(p - maximo), 0);
  const confianza = Math.exp(mejorPuntaje - maximo) / sumaExponenciales;

  return { categoria: mejorCategoria, confianza: Number(confianza.toFixed(3)) };
}

module.exports = {
  clasificarPregunta,
  tokenizar,
  EJEMPLOS_ENTRENAMIENTO,
  MODELO_ENTRENADO,
};
