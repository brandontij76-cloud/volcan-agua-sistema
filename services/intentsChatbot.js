// services/intentsChatbot.js
//
// El chatbot reconoce 6 categorias de pregunta (ver clasificadorPreguntas.js
// para el detalle del algoritmo Naive Bayes que las detecta). Antes, la
// respuesta que se daba para cada categoria estaba escrita directamente en
// el codigo de asistenteIA.js. Ahora vive en el nodo intents_chatbot de
// Firebase, con cache en memoria igual que configuracion_ruta y
// parametros_sistema (ver services/configuracionSistema.js), para poder
// ajustar el texto de una respuesta sin tener que tocar codigo ni
// desplegar de nuevo.
//
// Nota: los EJEMPLOS DE ENTRENAMIENTO del clasificador Naive Bayes (las
// frases usadas para "aprender" a que categoria pertenece una pregunta
// nueva) siguen en services/clasificadorPreguntas.js, ya que son un
// corpus de texto extenso pensado para explicarse como parte del modelo
// de IA en el capitulo correspondiente, no como un dato de configuracion
// operativa. Lo que aqui se administra es el vocabulario clave (para
// referencia) y la respuesta que el asistente da una vez identificada la
// categoria.

const INTENTS_POR_DEFECTO = {
  clima: {
    nombreIntent: 'Consulta de clima',
    palabrasClave: ['clima', 'lluvia', 'frio', 'temperatura', 'neblina', 'nublado'],
    respuestaBase: 'Consulto el pronostico en vivo para la cima del volcan antes de responder.',
    activo: true,
  },
  equipo: {
    nombreIntent: 'Recomendacion de equipo',
    palabrasClave: ['llevar', 'equipo', 'ropa', 'abrigo', 'zapatos', 'empacar'],
    respuestaBase: 'Recomiendo el equipo segun el clima esperado para tu horario de salida.',
    activo: true,
  },
  ruta: {
    nombreIntent: 'Datos de la ruta',
    palabrasClave: ['ruta', 'kilometros', 'distancia', 'desnivel', 'dificultad', 'duracion'],
    respuestaBase: 'Respondo con la distancia, desnivel y dificultad vigentes de la ruta.',
    activo: true,
  },
  emergencia: {
    nombreIntent: 'Emergencia / botón de pánico',
    palabrasClave: ['emergencia', 'panico', 'perdido', 'ayuda', 'auxilio'],
    respuestaBase:
      'Si presionas el botón de pánico, el sistema envía tu ubicación GPS actual al equipo administrativo ' +
      'de inmediato para que puedan ubicarte y coordinar ayuda. También detectamos automáticamente si te ' +
      'desvías mucho de la ruta o si dejas de moverte por un buen rato, y eso genera una alerta aunque no ' +
      'presiones el botón. Si tienes una emergencia real, presiona el botón y, si tienes señal, contacta ' +
      'también directamente a los números de emergencia locales.',
    activo: true,
  },
  registro_uso: {
    nombreIntent: 'Cómo usar el sistema',
    palabrasClave: ['registrar', 'usar', 'como funciona', 'monitoreo', 'cima', 'finalizar'],
    respuestaBase:
      'Para usar el sistema: te registras con tus datos y un contacto de emergencia, dejas la página de ' +
      'monitoreo abierta durante el recorrido (tu ubicación se envía cada 30 segundos), presionas ' +
      '"Llegué a la cima" cuando estés cerca de la cumbre, y "Finalizar recorrido" cuando estés de regreso ' +
      'cerca del pueblo.',
    activo: true,
  },
  saludo: {
    nombreIntent: 'Saludo',
    palabrasClave: ['hola', 'buenas', 'saludos'],
    respuestaBase: '¡Hola! Soy el asistente de Cumbre Segura. Puedo ayudarte con dudas sobre la ruta, el clima, qué llevar, o cómo funciona el sistema.',
    activo: true,
  },
  default: {
    nombreIntent: 'Sin categoría reconocida',
    palabrasClave: [],
    respuestaBase:
      'No estoy seguro de haber entendido bien tu pregunta (esto lo estoy respondiendo con mi modo de respaldo, ' +
      'sin conexión a Gemini en este momento). Puedo ayudarte con temas de clima, equipo necesario, la ruta, ' +
      'el botón de emergencia, o cómo usar el sistema — intenta reformular tu pregunta sobre alguno de esos temas.',
    activo: true,
  },
  fuera_de_tema: {
    nombreIntent: 'Pregunta no relacionada con Cumbre Segura',
    palabrasClave: [],
    respuestaBase:
      'Esa pregunta no está relacionada con Cumbre Segura, así que no la puedo responder. ' +
      'Solo puedo ayudarte con temas del Volcán de Agua: la ruta, el clima, qué equipo llevar, ' +
      'el botón de emergencia, o cómo usar el sistema (registro, monitoreo, confirmar la cima). ' +
      '¿Tienes alguna duda sobre eso?',
    activo: true,
  },
};

let cacheIntents = null;

async function inicializarIntentsChatbot(db) {
  const snapshot = await db.ref('intents_chatbot').once('value');
  if (snapshot.exists()) {
    const existentes = snapshot.val();
    // Completa con cualquier categoria nueva que se haya agregado al
    // codigo despues de que este nodo ya existiera en Firebase (por
    // ejemplo, "fuera_de_tema"), sin pisar las respuestas que el
    // administrador ya haya personalizado en las categorias existentes.
    const faltantes = {};
    Object.keys(INTENTS_POR_DEFECTO).forEach((categoria) => {
      if (!existentes[categoria]) faltantes[categoria] = INTENTS_POR_DEFECTO[categoria];
    });
    if (Object.keys(faltantes).length > 0) {
      await db.ref('intents_chatbot').update(faltantes);
      cacheIntents = { ...existentes, ...faltantes };
      console.log('[intents_chatbot] Se agregaron categorías nuevas:', Object.keys(faltantes).join(', '));
    } else {
      cacheIntents = existentes;
    }
  } else {
    await db.ref('intents_chatbot').set(INTENTS_POR_DEFECTO);
    cacheIntents = INTENTS_POR_DEFECTO;
    console.log('[intents_chatbot] Nodo creado en Firebase con los valores por defecto.');
  }
}

function obtenerIntents() {
  return cacheIntents || INTENTS_POR_DEFECTO;
}

function obtenerRespuestaBase(categoria) {
  const intents = obtenerIntents();
  const intent = intents[categoria] || intents.default;
  return intent.respuestaBase;
}

async function actualizarIntent(db, categoria, cambios) {
  const actual = obtenerIntents();
  if (!actual[categoria]) {
    throw new Error(`No existe la categoría de intent "${categoria}".`);
  }
  const nuevo = { ...actual, [categoria]: { ...actual[categoria], ...cambios } };
  await db.ref('intents_chatbot').set(nuevo);
  cacheIntents = nuevo;
  return nuevo[categoria];
}

module.exports = {
  inicializarIntentsChatbot,
  obtenerIntents,
  obtenerRespuestaBase,
  actualizarIntent,
};
