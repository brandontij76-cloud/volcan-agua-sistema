// public/js/monitor.js
// Obtiene la ubicacion GPS del navegador (sin necesidad de app nativa),
// la muestra en un mapa y la envia al backend cada 30 segundos. Tambien
// maneja el boton de panico y el cierre del recorrido.

const parametros = new URLSearchParams(window.location.search);
const excursionistaId = parametros.get('id');
const nombreExcursionista = parametros.get('nombre') || 'Excursionista';

document.getElementById('tituloExcursionista').textContent = `Recorrido de ${nombreExcursionista}`;

if (!excursionistaId) {
  document.getElementById('badgeEstado').textContent = 'Falta registro';
  document.getElementById('estadoGps').textContent = 'No hay un excursionista registrado en esta sesion.';
}

const INTERVALO_ENVIO_MS = 30000; // 30 segundos

let mapa, marcadorActual, ultimaPosicion = null;

function iniciarMapa(latInicial, lngInicial) {
  mapa = L.map('mapa').setView([latInicial, lngInicial], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(mapa);

  marcadorActual = L.marker([latInicial, lngInicial]).addTo(mapa).bindPopup('Tu ubicacion actual');

  // Dibuja la ruta de referencia hacia el Volcan de Agua.
  fetch('/api/ruta-referencia')
    .then((r) => r.json())
    .then((ruta) => {
      const puntos = ruta.map((p) => [p.lat, p.lng]);
      L.polyline(puntos, { color: '#2f5233', weight: 4, dashArray: '6 6' }).addTo(mapa);
    })
    .catch(() => { /* si falla, el mapa igual funciona sin la linea de ruta */ });
}

function actualizarMarcador(lat, lng) {
  if (!mapa) {
    iniciarMapa(lat, lng);
  } else {
    marcadorActual.setLatLng([lat, lng]);
    mapa.panTo([lat, lng]);
  }
}

function mostrarAlerta(alerta) {
  const caja = document.getElementById('mensajeAlerta');
  if (!alerta) {
    caja.classList.add('d-none');
    return;
  }
  caja.classList.remove('d-none');
  caja.textContent = `Alerta generada (${alerta.nivel}): ${alerta.mensaje}`;
}

async function enviarUbicacionAlServidor(lat, lng) {
  if (!excursionistaId) return;
  try {
    const respuesta = await fetch(`/api/excursionistas/${excursionistaId}/ubicacion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });
    const resultado = await respuesta.json();
    document.getElementById('ultimoEnvio').textContent = new Date().toLocaleTimeString('es-GT');
    mostrarAlerta(resultado.alerta);
  } catch (error) {
    console.error('No se pudo enviar la ubicacion:', error);
  }
}

function manejarPosicion(posicion) {
  const { latitude, longitude, accuracy } = posicion.coords;
  ultimaPosicion = { lat: latitude, lng: longitude };

  document.getElementById('estadoGps').textContent = 'Activo';
  document.getElementById('badgeEstado').textContent = 'Monitoreo activo';
  document.getElementById('badgeEstado').className = 'badge bg-success';
  document.getElementById('precisionGps').textContent = `${Math.round(accuracy)} m`;

  actualizarMarcador(latitude, longitude);
}

function manejarErrorGps(error) {
  document.getElementById('estadoGps').textContent = 'Sin acceso al GPS';
  document.getElementById('badgeEstado').textContent = 'GPS no disponible';
  document.getElementById('badgeEstado').className = 'badge bg-danger';
  console.error('Error de geolocalizacion:', error);
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(manejarPosicion, manejarErrorGps, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 15000,
  });

  // Envia la posicion mas reciente conocida cada INTERVALO_ENVIO_MS.
  setInterval(() => {
    if (ultimaPosicion) {
      enviarUbicacionAlServidor(ultimaPosicion.lat, ultimaPosicion.lng);
    }
  }, INTERVALO_ENVIO_MS);
} else {
  manejarErrorGps(new Error('Este navegador no soporta geolocalizacion.'));
}

// --- Boton de panico ---
document.getElementById('btnPanico').addEventListener('click', async () => {
  if (!ultimaPosicion) {
    alert('Todavia no se ha obtenido tu ubicacion GPS. Espera unos segundos e intenta de nuevo.');
    return;
  }
  const confirmar = confirm('¿Confirmas que deseas enviar una alerta de emergencia a la Municipalidad?');
  if (!confirmar) return;

  try {
    await fetch('/api/alertas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        excursionistaId,
        excursionistaNombre: nombreExcursionista,
        lat: ultimaPosicion.lat,
        lng: ultimaPosicion.lng,
        mensaje: 'El excursionista activo el boton de emergencia.',
      }),
    });
    alert('Alerta enviada. La Municipalidad ha sido notificada con tu ubicacion.');
  } catch (error) {
    alert('No se pudo enviar la alerta. Intenta de nuevo o busca ayuda por otro medio.');
    console.error(error);
  }
});

// --- Finalizar recorrido ---
document.getElementById('btnFinalizar').addEventListener('click', async () => {
  const confirmar = confirm('¿Confirmas que finalizaste el recorrido sin novedad?');
  if (!confirmar) return;

  try {
    await fetch(`/api/excursionistas/${excursionistaId}/finalizar`, { method: 'PATCH' });
    alert('Recorrido finalizado. ¡Gracias por registrarte!');
    window.location.href = 'index.html';
  } catch (error) {
    alert('No se pudo finalizar el recorrido.');
    console.error(error);
  }
});
