// public/js/chatbot.js
//
// Widget de chat flotante con IA (Gemini), reutilizable tanto para
// excursionistas (contexto "usuario") como para el panel administrativo
// (contexto "admin", con datos en vivo del sistema). Se inicializa
// llamando a iniciarChatbot('usuario') o iniciarChatbot('admin').
//
// El boton flotante muestra la mascota animada del sistema (ver
// Iconos.mascotaChatbot en iconos.js: un robot con los mismos colores del
// sistema, que respira/saluda/parpadea solo con CSS, en vez del icono fijo
// de mensaje que tenia antes). Encima lleva una insignia (badge) que
// aparece solo cuando el asistente ya respondio (a un excursionista o a un
// admin) y la persona todavia no ha abierto el panel a leerla; desaparece
// en cuanto lo abre.

let historialChat = [];
let contextoChat = 'usuario';

function iniciarChatbot(contexto) {
  contextoChat = contexto || 'usuario';

  const contenedor = document.createElement('div');
  contenedor.id = 'chatbotFlotante';
  contenedor.innerHTML = `
    <button id="chatbotBoton" class="chatbot-boton" aria-label="Abrir asistente">
      ${Iconos.mascotaChatbot()}
      <span id="chatbotBadge" class="chatbot-badge d-none">${Iconos.svg('chat', 10)}</span>
    </button>
    <div id="chatbotPanel" class="chatbot-panel d-none">
      <div class="chatbot-header">
        <span>${Iconos.svg('robot', 16)} Asistente Cumbre Segura</span>
        <button id="chatbotCerrar" class="chatbot-cerrar" aria-label="Cerrar">${Iconos.svg('cerrar', 14)}</button>
      </div>
      <div id="chatbotMensajes" class="chatbot-mensajes">
        <div class="chatbot-mensaje chatbot-mensaje-bot">
          ${contextoChat === 'admin'
            ? 'Hola, soy el asistente del panel. Puedes preguntarme sobre excursionistas activos, alertas, o el modelo de riesgo.'
            : 'Hola, soy el asistente de tu recorrido. Pregúntame sobre la ruta, el clima o qué llevar.'}
        </div>
      </div>
      <form id="chatbotFormulario" class="chatbot-form">
        <input type="text" id="chatbotInput" class="form-control" placeholder="Escribe tu pregunta…" autocomplete="off">
        <button type="submit" class="btn btn-volcan btn-sm">Enviar</button>
      </form>
    </div>
  `;
  document.body.appendChild(contenedor);

  const boton = document.getElementById('chatbotBoton');
  const badge = document.getElementById('chatbotBadge');
  const panel = document.getElementById('chatbotPanel');
  const cerrar = document.getElementById('chatbotCerrar');
  const formulario = document.getElementById('chatbotFormulario');
  const input = document.getElementById('chatbotInput');
  const mensajes = document.getElementById('chatbotMensajes');

  boton.addEventListener('click', () => {
    panel.classList.toggle('d-none');
    if (!panel.classList.contains('d-none')) {
      input.focus();
      // Ya lo esta abriendo para leer la respuesta: apaga la insignia de
      // "hay respuesta nueva".
      ocultarBadgeRespuesta(boton, badge);
    }
  });
  cerrar.addEventListener('click', () => panel.classList.add('d-none'));

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const pregunta = input.value.trim();
    if (!pregunta) return;

    agregarMensaje(mensajes, pregunta, 'usuario');
    historialChat.push({ rol: 'usuario', texto: pregunta });
    input.value = '';
    input.disabled = true;

    const indicador = agregarMensaje(mensajes, 'Escribiendo…', 'bot', true);

    try {
      const respuesta = await fetch('/api/asistente/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pregunta, contexto: contextoChat, historial: historialChat }),
      });
      const datos = await respuesta.json();
      indicador.textContent = datos.respuesta || 'No se pudo obtener respuesta.';
      historialChat.push({ rol: 'asistente', texto: datos.respuesta || '' });
      // El asistente ya respondio: se avisa en el boton flotante con la
      // insignia de mensaje hasta que la persona vuelva a abrir el panel.
      mostrarBadgeRespuesta(boton, badge);
    } catch (error) {
      indicador.textContent = 'No se pudo conectar con el asistente. Intenta de nuevo.';
      console.error(error);
    } finally {
      input.disabled = false;
      input.focus();
      mensajes.scrollTop = mensajes.scrollHeight;
    }
  });
}

// Insignia de "hay una respuesta nueva sin leer": aparece sobre la
// mascota y le agrega al boton una animacion de pulso sutil en el halo
// (ver .chatbot-boton--nuevo en css/style.css).
function mostrarBadgeRespuesta(boton, badge) {
  badge.classList.remove('d-none');
  boton.classList.add('chatbot-boton--nuevo');
}

function ocultarBadgeRespuesta(boton, badge) {
  badge.classList.add('d-none');
  boton.classList.remove('chatbot-boton--nuevo');
}

function agregarMensaje(contenedorMensajes, texto, quien, esTemporal) {
  const burbuja = document.createElement('div');
  burbuja.className = `chatbot-mensaje ${quien === 'usuario' ? 'chatbot-mensaje-usuario' : 'chatbot-mensaje-bot'}`;
  burbuja.textContent = texto;
  contenedorMensajes.appendChild(burbuja);
  contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
  return burbuja;
}
