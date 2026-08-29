// public/js/registro.js
// Maneja los dos flujos de registro: individual (con paso de revision antes
// de enviar) y por agencia (registro de un grupo, persona por persona, con
// opcion de editar/eliminar mientras el grupo no este completo).

// ---------------------------------------------------------------------
// GPS obligatorio: no se puede registrar sin activar la ubicacion.
// Se comparte entre ambos modos (individual y agencia): representa la
// ubicacion desde donde se esta haciendo el registro.
// ---------------------------------------------------------------------
let ubicacionRegistro = null; // { lat, lng } una vez que el navegador la entregue

function botonesQueDependenDelGps() {
  return [
    document.getElementById('btnRevisarIndividual'),
    document.getElementById('btnConfirmarAgencia'),
  ].filter(Boolean);
}

function actualizarEstadoGps(estado, mensaje) {
  const caja = document.getElementById('cajaGps');
  const texto = document.getElementById('mensajeGps');
  const btn = document.getElementById('btnActivarGps');

  texto.textContent = mensaje;
  caja.classList.remove('alert-warning', 'alert-success', 'alert-danger');

  const habilitar = estado === 'ok';
  if (estado === 'ok') {
    caja.classList.add('alert-success');
    btn.classList.add('d-none');
  } else if (estado === 'error') {
    caja.classList.add('alert-danger');
    btn.classList.remove('d-none');
  } else {
    caja.classList.add('alert-warning');
    btn.classList.add('d-none');
  }

  botonesQueDependenDelGps().forEach((b) => { b.disabled = !habilitar; });
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
      actualizarEstadoGps('ok', 'Ubicación activada correctamente. Ya puedes continuar.');
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
const hoyISO = new Date().toISOString().split('T')[0];
document.getElementById('fechaSalida').min = hoyISO;

// ---------------------------------------------------------------------
// Validaciones: telefono (minimo 8 digitos) y nombre real (dos o mas
// palabras, solo letras).
// ---------------------------------------------------------------------
function contarDigitos(texto) {
  return ((texto || '').match(/\d/g) || []).length;
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

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Hora estimada de salida: arma HH:MM (24h) a partir de 3 selects. Se usa
// en el formulario individual.
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

function horaLegible(hora24, periodoSel) {
  if (!hora24) return '';
  const [h] = hora24.split(':');
  return `${hora24} ${periodoSel === 'PM' ? 'p. m.' : 'a. m.'}`;
}

// ---------------------------------------------------------------------
// Modo de registro: individual (uno mismo) o agencia (registro de grupo).
// ---------------------------------------------------------------------
function modoActual() {
  return document.querySelector('input[name="modoRegistro"]:checked').value;
}

function actualizarModoRegistro() {
  const esAgencia = modoActual() === 'agencia';
  document.getElementById('panelIndividual').classList.toggle('d-none', esAgencia);
  document.getElementById('panelAgencia').classList.toggle('d-none', !esAgencia);
}

document.querySelectorAll('input[name="modoRegistro"]').forEach((input) => {
  input.addEventListener('change', actualizarModoRegistro);
});

// Carga la lista de agencias ya creadas por la Municipalidad (panel admin).
fetch('/api/agencias')
  .then((r) => r.json())
  .then((agencias) => {
    const select = document.getElementById('selectAgencia');
    agencias.forEach((a) => {
      const opcion = document.createElement('option');
      opcion.value = a.id;
      opcion.textContent = a.nombre;
      select.appendChild(opcion);
    });
  })
  .catch((error) => console.error('No se pudo cargar la lista de agencias:', error));

// =======================================================================
// MODO INDIVIDUAL: llenar formulario -> revisar -> confirmar y enviar.
// Una vez enviado, ya no se puede editar (por eso el paso de revision).
// =======================================================================
let ultimaConsultaAsistente = null;
let datosPendientesIndividual = null;

async function actualizarAsistente() {
  const horaSalida = obtenerHoraSalida24h();
  const fechaSalida = document.getElementById('fechaSalida').value;
  const caja = document.getElementById('cajaAsistente');
  const contenido = document.getElementById('contenidoAsistente');

  if (!horaSalida) {
    caja.classList.add('d-none');
    return;
  }

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

document.getElementById('formIndividual').addEventListener('submit', (evento) => {
  evento.preventDefault();

  const mensajeError = document.getElementById('mensajeError');
  mensajeError.classList.add('d-none');

  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const contactoNombre = document.getElementById('contactoNombre').value.trim();
  const contactoTelefono = document.getElementById('contactoTelefono').value.trim();
  const fechaSalida = document.getElementById('fechaSalida').value;
  const horaSalidaEstimada = obtenerHoraSalida24h();
  const periodoSel = document.getElementById('horaSalidaPeriodo').value;

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

  datosPendientesIndividual = {
    nombre,
    telefono,
    dpi: document.getElementById('dpi').value.trim(),
    personasGrupo: parseInt(document.getElementById('personasGrupo').value, 10) || 1,
    fechaSalidaEstimada: fechaSalida,
    horaSalidaEstimada,
    contactoEmergenciaNombre: contactoNombre,
    contactoEmergenciaTelefono: contactoTelefono,
    ubicacionRegistro,
    agenciaId: null,
  };

  // Muestra el resumen y pasa al paso de confirmacion.
  document.getElementById('resumenIndividual').innerHTML = `
    <ul class="list-unstyled mb-0">
      <li class="mb-2"><strong>Nombre:</strong> ${escaparHtml(nombre)}</li>
      <li class="mb-2"><strong>Teléfono:</strong> ${escaparHtml(telefono)}</li>
      <li class="mb-2"><strong>Personas en el grupo:</strong> ${datosPendientesIndividual.personasGrupo}</li>
      <li class="mb-2"><strong>Día de salida:</strong> ${fechaSalida}</li>
      <li class="mb-2"><strong>Hora de salida:</strong> ${horaLegible(horaSalidaEstimada, periodoSel)}</li>
      <li class="mb-2"><strong>Contacto de emergencia:</strong> ${escaparHtml(contactoNombre)} · ${escaparHtml(contactoTelefono)}</li>
    </ul>
  `;
  document.getElementById('mensajeErrorRevision').classList.add('d-none');
  document.getElementById('formIndividual').classList.add('d-none');
  document.getElementById('revisionIndividual').classList.remove('d-none');
  window.scrollTo({ top: document.getElementById('revisionIndividual').offsetTop - 20, behavior: 'smooth' });
});

document.getElementById('btnEditarIndividual').addEventListener('click', () => {
  document.getElementById('revisionIndividual').classList.add('d-none');
  document.getElementById('formIndividual').classList.remove('d-none');
});

document.getElementById('btnConfirmarIndividual').addEventListener('click', async () => {
  const btn = document.getElementById('btnConfirmarIndividual');
  const mensajeErrorRevision = document.getElementById('mensajeErrorRevision');
  mensajeErrorRevision.classList.add('d-none');

  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const respuesta = await fetch('/api/excursionistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosPendientesIndividual),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(resultado.error || 'No se pudo completar el registro.');
    }

    // Ya se envio: no hay vuelta atras, se redirige al monitoreo GPS.
    window.location.href = `monitor.html?id=${resultado.id}&nombre=${encodeURIComponent(resultado.nombre)}`;
  } catch (error) {
    mensajeErrorRevision.textContent = error.message;
    mensajeErrorRevision.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = '✅ Confirmar y enviar';
  }
});

// =======================================================================
// MODO AGENCIA: la agencia ya envio su lista de nombres y telefonos a la
// Municipalidad, que la cargo desde el panel administrativo. Aqui el
// excursionista solo: 1) elige su agencia, 2) busca y selecciona su
// nombre en la lista precargada, y 3) confirma escribiendo su telefono
// (debe coincidir con el que la agencia proporciono). Si coincide, se
// activa su registro y arranca el monitoreo GPS en este dispositivo,
// igual que en el modo individual.
// =======================================================================
let pendientesAgenciaActual = [];
let personaSeleccionadaAgencia = null; // { id, nombre }

document.getElementById('selectAgencia').addEventListener('change', cargarPendientesDeAgencia);

async function cargarPendientesDeAgencia() {
  const agenciaId = document.getElementById('selectAgencia').value;
  const cajaSinAgencia = document.getElementById('cajaSinAgenciaSeleccionada');
  const cajaBuscar = document.getElementById('cajaBuscarNombre');
  const cajaConfirmar = document.getElementById('cajaConfirmarTelefono');

  // Reinicia el paso de seleccion/confirmacion cada vez que se cambia de agencia.
  personaSeleccionadaAgencia = null;
  cajaConfirmar.classList.add('d-none');
  document.getElementById('buscarNombreAgencia').value = '';

  if (!agenciaId) {
    cajaSinAgencia.classList.remove('d-none');
    cajaSinAgencia.textContent = 'Selecciona tu agencia para buscar tu nombre.';
    cajaBuscar.classList.add('d-none');
    pendientesAgenciaActual = [];
    return;
  }

  cajaSinAgencia.classList.add('d-none');
  cajaBuscar.classList.remove('d-none');
  document.getElementById('listaNombresAgencia').innerHTML = '<div class="text-muted small p-2">Cargando…</div>';

  try {
    const respuesta = await fetch(`/api/excursionistas/agencia/${agenciaId}/pendientes`);
    pendientesAgenciaActual = await respuesta.json();
    renderListaNombresAgencia(pendientesAgenciaActual);
  } catch (error) {
    console.error('No se pudo cargar la lista de la agencia:', error);
    document.getElementById('listaNombresAgencia').innerHTML = '<div class="text-danger small p-2">No se pudo cargar la lista. Intenta de nuevo.</div>';
  }
}

function renderListaNombresAgencia(lista) {
  const contenedor = document.getElementById('listaNombresAgencia');
  const sinResultados = document.getElementById('sinResultadosAgencia');

  if (lista.length === 0) {
    contenedor.innerHTML = '';
    sinResultados.classList.remove('d-none');
    return;
  }
  sinResultados.classList.add('d-none');
  contenedor.innerHTML = lista.map((p) => `
    <button type="button" class="list-group-item list-group-item-action" onclick="elegirPersonaAgencia('${p.id}')">
      ${escaparHtml(p.nombre)}
    </button>
  `).join('');
}

document.getElementById('buscarNombreAgencia').addEventListener('input', (evento) => {
  const texto = evento.target.value.trim().toLowerCase();
  const filtrada = texto
    ? pendientesAgenciaActual.filter((p) => p.nombre.toLowerCase().includes(texto))
    : pendientesAgenciaActual;
  renderListaNombresAgencia(filtrada);
});

function elegirPersonaAgencia(id) {
  const persona = pendientesAgenciaActual.find((p) => p.id === id);
  if (!persona) return;
  personaSeleccionadaAgencia = persona;

  document.getElementById('nombreSeleccionadoAgencia').textContent = persona.nombre;
  document.getElementById('cajaBuscarNombre').classList.add('d-none');
  document.getElementById('cajaConfirmarTelefono').classList.remove('d-none');
  document.getElementById('telefonoConfirmarAgencia').value = '';
  document.getElementById('mensajeErrorAgenciaConfirmar').classList.add('d-none');
  document.getElementById('telefonoConfirmarAgencia').focus();
}

document.getElementById('btnCambiarNombreAgencia').addEventListener('click', () => {
  personaSeleccionadaAgencia = null;
  document.getElementById('cajaConfirmarTelefono').classList.add('d-none');
  document.getElementById('cajaBuscarNombre').classList.remove('d-none');
});

document.getElementById('btnConfirmarAgencia').addEventListener('click', async () => {
  const mensajeError = document.getElementById('mensajeErrorAgenciaConfirmar');
  mensajeError.classList.add('d-none');

  if (!personaSeleccionadaAgencia) return;

  if (!ubicacionRegistro) {
    mensajeError.textContent = 'Debes activar tu ubicación GPS antes de confirmar.';
    mensajeError.classList.remove('d-none');
    return;
  }

  const telefono = document.getElementById('telefonoConfirmarAgencia').value.trim();
  if (!telefonoValido(telefono)) {
    mensajeError.textContent = 'Escribe tu número de teléfono (mínimo 8 dígitos).';
    mensajeError.classList.remove('d-none');
    return;
  }

  const btn = document.getElementById('btnConfirmarAgencia');
  btn.disabled = true;
  btn.textContent = 'Confirmando...';

  try {
    const respuesta = await fetch(`/api/excursionistas/${personaSeleccionadaAgencia.id}/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefono, ubicacionRegistro }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo confirmar el registro.');

    window.location.href = `monitor.html?id=${resultado.id}&nombre=${encodeURIComponent(resultado.nombre)}`;
  } catch (error) {
    mensajeError.textContent = error.message;
    mensajeError.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = 'Confirmar e iniciar monitoreo';
  }
});
