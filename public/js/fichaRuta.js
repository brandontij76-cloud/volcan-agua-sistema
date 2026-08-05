// public/js/fichaRuta.js
//
// Renderiza una tarjeta con los datos generales de la ruta (distancia,
// desnivel, dificultad) y el clima actual con iconos, similar a las fichas
// de Wikiloc/AllTrails. Se usa tanto en el panel administrativo como en la
// pantalla del excursionista (monitor.html).

// Convierte los datos de clima en un set de 3 iconos + etiqueta, tal como
// muestran las apps de senderismo (precipitacion / temperatura / cielo).
function iconosClima(clima) {
  const iconos = [];

  // 1) Precipitacion
  if (clima.probabilidadLluvia >= 60) {
    iconos.push({ icono: '⛈️', etiqueta: 'Lluvia probable' });
  } else if (clima.probabilidadLluvia >= 30) {
    iconos.push({ icono: '🌦️', etiqueta: 'Posible llovizna' });
  } else {
    iconos.push({ icono: '☀️', etiqueta: 'Sin lluvia' });
  }

  // 2) Temperatura
  if (clima.temperaturaC <= 8) {
    iconos.push({ icono: '❄️', etiqueta: 'Frío intenso' });
  } else if (clima.temperaturaC <= 14) {
    iconos.push({ icono: '🌡️', etiqueta: 'Fresco' });
  } else {
    iconos.push({ icono: '🌤️', etiqueta: 'Templado' });
  }

  // 3) Cielo / viento
  if (clima.nubosidad >= 70) {
    iconos.push({ icono: '☁️', etiqueta: 'Nublado / neblina' });
  } else if (clima.vientoKmh >= 30) {
    iconos.push({ icono: '💨', etiqueta: 'Viento fuerte' });
  } else {
    iconos.push({ icono: '🌈', etiqueta: 'Cielo despejado' });
  }

  return iconos;
}

function claseDificultad(dificultad) {
  const texto = (dificultad || '').toLowerCase();
  if (texto.includes('muy difícil') || texto.includes('muy dificil')) return 'badge-nivel-grave';
  if (texto.includes('difícil') || texto.includes('dificil')) return 'badge-nivel-moderada';
  return 'badge-nivel-leve';
}

/**
 * Pinta la ficha de ruta dentro del contenedor indicado.
 * @param {string} idContenedor - id del elemento donde se inserta la tarjeta
 */
async function iniciarFichaRuta(idContenedor) {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  contenedor.innerHTML = '<div class="text-muted small">Cargando ficha de la ruta…</div>';

  try {
    const respuesta = await fetch('/api/asistente/ficha-ruta');
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo obtener la ficha.');

    const { infoRuta, clima } = datos;
    const iconos = iconosClima(clima);
    const fuenteTexto = clima.fuenteClima === 'api' ? 'Pronóstico en vivo' : 'Estimado por temporada';

    contenedor.innerHTML = `
      <div class="card p-3 p-md-4 ficha-ruta">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <h5 class="mb-0">🏔️ ${infoRuta.nombre}</h5>
          <span class="chip">${fuenteTexto}</span>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-4">
            <div class="ficha-ruta-metrica-label">Distancia</div>
            <div class="ficha-ruta-metrica-valor">${infoRuta.distanciaKm} km</div>
          </div>
          <div class="col-4">
            <div class="ficha-ruta-metrica-label">Desnivel +</div>
            <div class="ficha-ruta-metrica-valor">${infoRuta.desnivelM} m</div>
          </div>
          <div class="col-4">
            <div class="ficha-ruta-metrica-label">Dificultad</div>
            <span class="badge ${claseDificultad(infoRuta.dificultad)}">${infoRuta.dificultad}</span>
          </div>
        </div>
        <div class="ficha-ruta-clima">
          ${iconos.map((i) => `
            <div class="ficha-ruta-icono">
              <div class="ficha-ruta-icono-emoji">${i.icono}</div>
              <div class="ficha-ruta-icono-label">${i.etiqueta}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    contenedor.innerHTML = '<div class="alert alert-light small mb-0">No se pudo cargar la ficha de la ruta en este momento.</div>';
    console.error('Error al cargar ficha de ruta:', error);
  }
}
