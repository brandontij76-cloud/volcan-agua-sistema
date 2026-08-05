// public/js/registro.js
// Envia el formulario de registro al backend y, si todo sale bien,
// redirige al excursionista a la pantalla de monitoreo con su id.

// --- Asistente de recorrido: clima + recomendaciones segun la hora de salida ---
let ultimaConsultaAsistente = null;

document.getElementById('horaSalida').addEventListener('change', async (evento) => {
  const horaSalida = evento.target.value;
  const caja = document.getElementById('cajaAsistente');
  const contenido = document.getElementById('contenidoAsistente');

  if (!horaSalida) {
    caja.classList.add('d-none');
    return;
  }

  // Evita pedir lo mismo dos veces seguidas.
  if (horaSalida === ultimaConsultaAsistente) return;
  ultimaConsultaAsistente = horaSalida;

  caja.classList.remove('d-none');
  contenido.innerHTML = 'Consultando el clima esperado para tu salida…';

  try {
    const respuesta = await fetch(`/api/asistente/recomendaciones?horaSalida=${encodeURIComponent(horaSalida)}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo consultar el asistente.');

    contenido.innerHTML = construirHtmlAsistente(datos);
  } catch (error) {
    contenido.innerHTML = 'No se pudo consultar el clima en este momento, pero puedes continuar tu registro sin problema.';
    console.error(error);
  }
});

function construirHtmlAsistente(datos) {
  const { clima, recomendaciones, estadisticaHistorica } = datos;

  const climaTexto = clima.fuenteClima === 'api'
    ? `Pronóstico para tu hora de salida: ~${Math.round(clima.temperaturaC)}°C, ${clima.probabilidadLluvia}% de probabilidad de lluvia, viento ${Math.round(clima.vientoKmh)} km/h.`
    : `No se pudo consultar el pronóstico exacto; según la temporada (${clima.temporada === 'lluviosa' ? 'lluviosa' : 'seca'}) se esperan condiciones típicas de ~${clima.temperaturaC}°C.`;

  let historicoTexto = '';
  if (estadisticaHistorica?.muestraSuficiente) {
    historicoTexto = `<div class="mt-2">📊 De quienes han salido en este horario (${estadisticaHistorica.franja}), ${estadisticaHistorica.porcentajeConAlerta}% tuvo alguna alerta durante su recorrido.</div>`;
  }

  const listaRecomendaciones = recomendaciones.map((r) => `<li>${r}</li>`).join('');

  return `
    <div>${climaTexto}</div>
    ${historicoTexto}
    <div class="mt-2 mb-1"><strong>Qué llevar:</strong></div>
    <ul class="mb-0 ps-3">${listaRecomendaciones}</ul>
  `;
}

// --- Envio del formulario ---

document.getElementById('formRegistro').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const btn = document.getElementById('btnRegistrar');
  const mensajeError = document.getElementById('mensajeError');
  mensajeError.classList.add('d-none');

  const datos = {
    nombre: document.getElementById('nombre').value.trim(),
    telefono: document.getElementById('telefono').value.trim(),
    dpi: document.getElementById('dpi').value.trim(),
    personasGrupo: parseInt(document.getElementById('personasGrupo').value, 10) || 1,
    horaSalidaEstimada: document.getElementById('horaSalida').value,
    contactoEmergenciaNombre: document.getElementById('contactoNombre').value.trim(),
    contactoEmergenciaTelefono: document.getElementById('contactoTelefono').value.trim(),
  };

  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    const respuesta = await fetch('/api/excursionistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(resultado.error || 'No se pudo completar el registro.');
    }

    // Redirige a la pantalla de monitoreo, pasando el id del excursionista.
    window.location.href = `monitor.html?id=${resultado.id}&nombre=${encodeURIComponent(resultado.nombre)}`;
  } catch (error) {
    mensajeError.textContent = error.message;
    mensajeError.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = 'Registrar e iniciar monitoreo';
  }
});
