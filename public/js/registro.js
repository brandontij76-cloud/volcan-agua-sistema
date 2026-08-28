// public/js/registro.js
// Envia el formulario de registro al backend y, si todo sale bien,
// redirige al excursionista a la pantalla de monitoreo con su id.

// ---------------------------------------------------------------------
// GPS obligatorio: no se puede registrar sin activar la ubicacion.
// ---------------------------------------------------------------------
let ubicacionRegistro = null; // { lat, lng } una vez que el navegador la entregue

function actualizarEstadoGps(estado, mensaje) {
  const caja = document.getElementById('cajaGps');
  const texto = document.getElementById('mensajeGps');
  const btn = document.getElementById('btnActivarGps');
  const btnRegistrar = document.getElementById('btnRegistrar');

  texto.textContent = mensaje;
  caja.classList.remove('alert-warning', 'alert-success', 'alert-danger');

  if (estado === 'ok') {
    caja.classList.add('alert-success');
    btn.classList.add('d-none');
    btnRegistrar.disabled = false;
  } else if (estado === 'error') {
    caja.classList.add('alert-danger');
    btn.classList.remove('d-none');
    btnRegistrar.disabled = true;
  } else {
    caja.classList.add('alert-warning');
    btn.classList.add('d-none');
    btnRegistrar.disabled = true;
  }
}

function solicitarUbicacion() {
  if (!navigator.geolocation) {
    actualizarEstadoGps('error', 'Tu navegador no soporta ubicación GPS. No es posible registrarte sin ella.');
    return;
  }

  actualizarEstadoGps('pendiente', 'Solicitando acceso a tu ubicación...');

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      ubicacionRegistro = {
        lat: posicion.coords.latitude,
        lng: posicion.coords.longitude,
      };
      actualizarEstadoGps('ok', 'Ubicación activada correctamente. Ya puedes registrarte.');
    },
    (error) => {
      ubicacionRegistro = null;
      const mensajes = {
        1: 'Debes dar permiso de ubicación para poder registrarte. Actívalo en tu navegador e intenta de nuevo.',
        2: 'No se pudo obtener tu ubicación (GPS no disponible). Verifica tu conexión e intenta de nuevo.',
        3: 'La solicitud de ubicación tardó demasiado. Intenta de nuevo.',
      };
      actualizarEstadoGps('error', mensajes[error.code] || 'No se pudo obtener tu ubicación. Intenta de nuevo.');
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

document.getElementById('btnActivarGps').addEventListener('click', solicitarUbicacion);
solicitarUbicacion(); // se pide automaticamente al cargar la pagina

// Fecha minima seleccionable: hoy (no tiene sentido registrar una subida en el pasado).
document.getElementById('fechaSalida').min = new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------
// Validaciones: telefono (minimo 8 digitos) y nombre real (dos o mas
// palabras, solo letras).
// ---------------------------------------------------------------------
function contarDigitos(texto) {
  return (texto.match(/\d/g) || []).length;
}

function telefonoValido(texto) {
  return contarDigitos(texto) >= 8;
}

function nombreValido(texto) {
  const limpio = (texto || '').trim();
  const soloLetrasYEspacios = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/.test(limpio);
  if (!soloLetrasYEspacios) return false;
  const palabras = limpio.split(/\s+/).filter((p) => p.length >= 2);
  return palabras.length >= 2; // al menos nombre y apellido
}

// ---------------------------------------------------------------------
// Hora estimada de salida: se arma en formato 24h (HH:MM) a partir de
// los selectores de hora / minuto / a.m.-p.m., para no cambiar el
// formato que ya espera el backend y el asistente de recorrido.
// ---------------------------------------------------------------------
function obtenerHoraSalida24h() {
  const horaSel = document.getElementById('horaSalidaHora').value;
  const minutoSel = document.getElementById('horaSalidaMinuto').value;
  const periodoSel = document.getElementById('horaSalidaPeriodo').value;

  if (!horaSel) return '';

  let hora24 = parseInt(horaSel, 10) % 12;
  if (periodoSel === 'PM') hora24 += 12;

  return `${String(hora24).padStart(2, '0')}:${minutoSel}`;
}

// --- Asistente de recorrido: clima + recomendaciones segun la hora de salida ---
let ultimaConsultaAsistente = null;

async function actualizarAsistente() {
  const horaSalida = obtenerHoraSalida24h();
  const fechaSalida = document.getElementById('fechaSalida').value;
  const caja = document.getElementById('cajaAsistente');
  const contenido = document.getElementById('contenidoAsistente');

  if (!horaSalida) {
    caja.classList.add('d-none');
    return;
  }

  // Evita pedir lo mismo dos veces seguidas.
  const clave = `${fechaSalida}|${horaSalida}`;
  if (clave === ultimaConsultaAsistente) return;
  ultimaConsultaAsistente = clave;

  caja.classList.remove('d-none');
  contenido.innerHTML = 'Consultando el clima esperado para tu salida…';

  try {
    const personasGrupo = document.getElementById('personasGrupo').value || 1;
    const parametros = new URLSearchParams({ horaSalida, personasGrupo });
    if (fechaSalida) parametros.set('fecha', fechaSalida);

    const respuesta = await fetch(`/api/asistente/recomendaciones?${parametros.toString()}`);
    const datos = await respuesta.json();

    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo consultar el asistente.');

    contenido.innerHTML = construirHtmlAsistente(datos);
  } catch (error) {
    contenido.innerHTML = 'No se pudo consultar el clima en este momento, pero puedes continuar tu registro sin problema.';
    console.error(error);
  }
}

['horaSalidaHora', 'horaSalidaMinuto', 'horaSalidaPeriodo', 'fechaSalida'].forEach((idCampo) => {
  document.getElementById(idCampo).addEventListener('change', actualizarAsistente);
});

function construirHtmlAsistente(datos) {
  const { clima, recomendaciones, estadisticaHistorica, riesgo, textoGemini } = datos;

  // Si Gemini generó un resumen en lenguaje natural, se muestra primero
  // (es lo más fácil de leer). Si no, se arma el resumen con los datos
  // crudos como respaldo.
  if (textoGemini) {
    return `
      <div class="chip mb-2">✨ Generado con IA (Gemini)</div>
      <div>${textoGemini}</div>
      <div class="mt-2 mb-1"><strong>Qué llevar:</strong></div>
      <ul class="mb-0 ps-3">${recomendaciones.map((r) => `<li>${r}</li>`).join('')}</ul>
    `;
  }

  const climaTexto = clima.fuenteClima === 'api'
    ? `Pronóstico para tu hora de salida: ~${Math.round(clima.temperaturaC)}°C, ${clima.probabilidadLluvia}% de probabilidad de lluvia, viento ${Math.round(clima.vientoKmh)} km/h.`
    : `No se pudo consultar el pronóstico exacto; según la temporada (${clima.temporada === 'lluviosa' ? 'lluviosa' : 'seca'}) se esperan condiciones típicas de ~${clima.temperaturaC}°C.`;

  let riesgoTexto = '';
  if (riesgo?.muestraSuficiente) {
    riesgoTexto = `<div class="mt-2">🤖 Modelo de riesgo (entrenado con ${riesgo.totalMuestras} recorridos previos): <strong>${riesgo.probabilidadRiesgo}%</strong> de probabilidad de alguna alerta en este horario.</div>`;
  } else if (riesgo) {
    riesgoTexto = `<div class="mt-2 text-muted small">🤖 El modelo de riesgo aún no tiene suficientes recorridos registrados (mínimo ${riesgo.muestrasMinimasRequeridas}) para predecir con confianza.</div>`;
  }

  let historicoTexto = '';
  if (estadisticaHistorica?.muestraSuficiente) {
    historicoTexto = `<div class="mt-2">📊 De quienes han salido en este horario (${estadisticaHistorica.franja}), ${estadisticaHistorica.porcentajeConAlerta}% tuvo alguna alerta durante su recorrido.</div>`;
  }

  const listaRecomendaciones = recomendaciones.map((r) => `<li>${r}</li>`).join('');

  return `
    <div>${climaTexto}</div>
    ${riesgoTexto}
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

  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const contactoNombre = document.getElementById('contactoNombre').value.trim();
  const contactoTelefono = document.getElementById('contactoTelefono').value.trim();
  const fechaSalida = document.getElementById('fechaSalida').value;
  const horaSalidaEstimada = obtenerHoraSalida24h();

  // --- Validaciones antes de enviar nada al servidor ---
  if (!ubicacionRegistro) {
    mensajeError.textContent = 'Debes activar tu ubicación GPS antes de registrarte.';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (!nombreValido(nombre)) {
    mensajeError.textContent = 'Escribe tu nombre completo (nombre y apellido, solo letras).';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (!telefonoValido(telefono)) {
    mensajeError.textContent = 'El teléfono debe tener al menos 8 dígitos.';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (!nombreValido(contactoNombre)) {
    mensajeError.textContent = 'Escribe el nombre completo de tu contacto de emergencia (nombre y apellido, solo letras).';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (!telefonoValido(contactoTelefono)) {
    mensajeError.textContent = 'El teléfono del contacto de emergencia debe tener al menos 8 dígitos.';
    mensajeError.classList.remove('d-none');
    return;
  }
  if (!fechaSalida || !horaSalidaEstimada) {
    mensajeError.textContent = 'Indica el día y la hora en la que vas a subir.';
    mensajeError.classList.remove('d-none');
    return;
  }

  const datos = {
    nombre,
    telefono,
    dpi: document.getElementById('dpi').value.trim(),
    personasGrupo: parseInt(document.getElementById('personasGrupo').value, 10) || 1,
    fechaSalidaEstimada: fechaSalida,
    horaSalidaEstimada,
    contactoEmergenciaNombre: contactoNombre,
    contactoEmergenciaTelefono: contactoTelefono,
    ubicacionRegistro,
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
