// services/conversacionesChatbot.js
//
// Antes, cada pregunta y respuesta del chatbot (services/asistenteIA.js,
// funcion responderChat) se mandaba de vuelta al navegador y se perdia
// para siempre: no quedaba ningun registro de que preguntaba la gente, ni
// de que tan seguido Gemini fallaba y el sistema tenia que caer al
// respaldo con el clasificador Naive Bayes propio
// (services/clasificadorPreguntas.js).
//
// Este modulo guarda cada intercambio real en el nodo raiz
// "conversaciones_chatbot" de Firebase. Es una tabla nueva e
// independiente de "intents_chatbot": esa otra guarda el catalogo de
// categorias/intenciones que reconoce el clasificador (clima, equipo,
// ruta, emergencia, registro_uso, saludo); esta guarda las conversaciones
// reales que efectivamente ocurrieron, una fila por pregunta respondida.

// Registra una conversacion. Nunca lanza error hacia arriba: si falla el
// guardado, se avisa en consola pero la respuesta que ya se le dio a la
// persona no se ve afectada.
async function registrarConversacion(db, { pregunta, respuesta, contexto, generadoConIA }) {
  if (!db || !pregunta || !respuesta) return null;

  try {
    const ref = db.ref('conversaciones_chatbot').push();
    const registro = {
      id: ref.key,
      pregunta,
      respuesta,
      contexto: contexto === 'admin' ? 'admin' : 'usuario',
      generadoConIA: Boolean(generadoConIA),
      fecha: Date.now(),
    };
    await ref.set(registro);
    return registro;
  } catch (error) {
    console.warn('[Conversaciones Chatbot] No se pudo guardar la conversacion:', error.message);
    return null;
  }
}

// Lista el historial de conversaciones, mas reciente primero. limite evita
// traer miles de filas de una sola vez al panel administrativo.
async function listarConversaciones(db, limite = 200) {
  const snapshot = await db.ref('conversaciones_chatbot').once('value');
  const filas = Object.values(snapshot.val() || {});
  return filas.sort((a, b) => (b.fecha || 0) - (a.fecha || 0)).slice(0, limite);
}

module.exports = { registrarConversacion, listarConversaciones };
