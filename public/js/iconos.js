// public/js/iconos.js
//
// Set propio de iconos vectoriales (linea, minimalistas, bordes
// redondeados) que reemplaza el uso de emojis nativos en toda la
// aplicacion. Cada icono es un <svg> inline que hereda el color del
// texto circundante (stroke="currentColor"), por lo que se adapta solo
// a los 3 temas del sitio (dia / tarde / noche) sin configuracion extra.
//
// Uso en HTML estatico:
//   <span class="icono" data-icono="pin"></span>
//   Iconos.aplicarEnPagina() reemplaza esos <span> por el SVG real.
//
// Uso en JS (contenido generado dinamicamente):
//   `${Iconos.svg('montana', 16)} Cima confirmada`

const ICONOS_PATHS = {
  // --- Navegacion / identidad ---
  documento: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 12l2 2 4-4"/>',
  pin: '<path d="M12 21s7-7.5 7-12a7 7 0 0 0-14 0c0 4.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  alerta: '<path d="M12 2a5 5 0 0 0-5 5v3c0 3-1.5 4.5-2.5 5.5h15C18.5 14.5 17 13 17 10V7a5 5 0 0 0-5-5z"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0"/>',
  montana: '<path d="M3 20.5l5.5-11 3.5 5 2-3 6.5 9H3z"/><path d="M14 9.5L15.5 7l1.5 2.5"/>',
  persona: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  grupo: '<circle cx="8.5" cy="8" r="3.2"/><path d="M2 20.5c0-3.7 2.8-5.8 6.5-5.8s6.5 2.1 6.5 5.8"/><circle cx="17" cy="9" r="2.6"/><path d="M14.3 15c2.8.4 5 2.3 5 5.5"/>',
  edificio: '<rect x="5" y="3" width="10" height="18"/><path d="M15 8h4v13h-4"/><path d="M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  brujula: '<circle cx="12" cy="12" r="9"/><path d="M15.2 8.8l-2 5.4-5.4 2 2-5.4 5.4-2z"/>',
  herramientas: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8z"/>',

  // --- Acciones ---
  lapiz: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/>',
  papelera: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
  descarga: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  advertencia: '<path d="M10.3 4.3a2 2 0 0 1 3.4 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.7-2.7l8-14z"/><path d="M12 9v4"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  robot: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M12 5v4"/><circle cx="12" cy="4" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="14" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.1" fill="currentColor" stroke="none"/><path d="M3 12v3M21 12v3"/>',
  destello: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M19 15l.7 1.9 1.8.6-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.6L19 15z"/>',
  grafico: '<path d="M4 20V10M12 20V4M20 20v-7"/><path d="M2 20h20"/>',
  trofeo: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 5H5a3 3 0 0 0 3 5"/><path d="M16 5h3a3 3 0 0 1-3 5"/><path d="M12 13v4"/><path d="M9 21h6"/><path d="M9.5 17h5l.5 4h-6l.5-4z"/>',

  // --- Puntos de referencia en el mapa ---
  iglesia: '<path d="M12 2v3.2M10.3 3.6h3.4"/><path d="M6 21V11l6-5 6 5v10"/><path d="M6 21h12"/><path d="M10 21v-5h4v5"/>',
  auto: '<path d="M4 16l1.5-5A2 2 0 0 1 7.4 9.5h9.2a2 2 0 0 1 1.9 1.5L20 16"/><rect x="3" y="16" width="18" height="4" rx="1"/><circle cx="7.5" cy="19.6" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="19.6" r="1.1" fill="currentColor" stroke="none"/>',
  camara: '<path d="M4 8h3l2-2h6l2 2h3v11H4V8z"/><circle cx="12" cy="13.5" r="3.2"/>',
  bota: '<path d="M9 3v8.5L5 15a2 2 0 0 0-1 1.7V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1c0-2.5-2-4-4.5-4H13V3H9z"/><path d="M9 8h4"/>',
  bandera: '<path d="M6 21V4"/><path d="M6 4h12l-3 4 3 4H6"/>',

  // --- Clima ---
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.3M12 19.2v2.3M4.2 12H1.9M22.1 12h-2.3M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6"/>',
  nubeSol: '<circle cx="7.3" cy="7" r="2.8"/><path d="M7.3 2.5v1.2M3.6 4.2l.85.85M2.1 7.5h1.2"/><path d="M10 18a4 4 0 0 1-.3-8 5 5 0 0 1 9.6-1.2A4.3 4.3 0 0 1 19 18H10z"/>',
  nube: '<path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1.5A4.5 4.5 0 0 1 17 18H7z"/>',
  lluvia: '<path d="M7 14.5a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1.5A4.5 4.5 0 0 1 17 14.5H7z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  tormenta: '<path d="M7 12.5a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1.5A4.5 4.5 0 0 1 17 12.5H7z"/><path d="M13 12.5l-3 5h3l-2 4"/>',
  termometro: '<path d="M10 14.2V4a2 2 0 0 0-4 0v10.2a4 4 0 1 0 4 0z"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/>',
  viento: '<path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3 16h9a2 2 0 1 1-2 2"/>',
  arcoiris: '<path d="M3 18a9 9 0 0 1 18 0"/><path d="M6.5 18a5.5 5.5 0 0 1 11 0"/><path d="M10 18a2 2 0 0 1 4 0"/>',

  // --- Avatar del mapa (persona, version solida para el circulo) ---
  personaSolida: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/>',
};

const Iconos = {
  /**
   * Devuelve el markup <svg> de un icono, listo para insertar inline.
   * @param {string} nombre - clave dentro de ICONOS_PATHS
   * @param {number} tamano - ancho/alto en px (por defecto 18)
   * @param {object} [opciones] - { relleno: boolean } usa fill en vez de stroke
   */
  svg(nombre, tamano = 18, opciones = {}) {
    const contenido = ICONOS_PATHS[nombre];
    if (!contenido) return '';
    const relleno = !!opciones.relleno;
    return `<svg class="icono-svg" width="${tamano}" height="${tamano}" viewBox="0 0 24 24" fill="${relleno ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${contenido}</svg>`;
  },

  /**
   * Reemplaza todo elemento `<span data-icono="nombre">` de la pagina por
   * su SVG correspondiente. Se llama una vez al cargar cada pantalla.
   */
  aplicarEnPagina() {
    document.querySelectorAll('[data-icono]').forEach((el) => {
      const nombre = el.getAttribute('data-icono');
      const tamano = parseInt(el.getAttribute('data-icono-tam') || '18', 10);
      el.innerHTML = Iconos.svg(nombre, tamano);
      el.classList.add('icono');
    });
  },

  // -----------------------------------------------------------------
  // Avatar de mapa estilo Google Maps: circulo con icono + un cono de
  // direccion que aparece solo cuando la persona esta en movimiento y
  // apunta hacia el rumbo (bearing) calculado entre su ultima posicion
  // y la nueva.
  // -----------------------------------------------------------------

  /** Rumbo en grados (0 = norte, 90 = este) entre dos puntos {lat,lng}. */
  calcularRumbo(origen, destino) {
    const toRad = (g) => (g * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const lat1 = toRad(origen.lat);
    const lat2 = toRad(destino.lat);
    const dLng = toRad(destino.lng - origen.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  },

  /** Distancia aproximada en metros entre dos puntos {lat,lng} (haversine). */
  distanciaMetros(a, b) {
    const R = 6371000;
    const toRad = (g) => (g * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  /**
   * Construye el HTML interno de un divIcon de Leaflet: circulo con
   * iniciales/icono, etiqueta con el nombre (y opcionalmente km), y un
   * cono de direccion que solo se muestra cuando enMovimiento es true.
   */
  htmlAvatarMapa({ etiqueta, rumbo = 0, enMovimiento = false, variante = 'excursionista' }) {
    const clases = ['avatar-mapa', `avatar-mapa--${variante}`];
    if (enMovimiento) clases.push('avatar-mapa--movimiento');
    return `
      <div class="${clases.join(' ')}">
        <div class="avatar-etiqueta">${etiqueta}</div>
        <div class="avatar-cono" style="transform: rotate(${rumbo}deg);"></div>
        <div class="avatar-circulo">${Iconos.svg('personaSolida', 16, { relleno: true })}</div>
      </div>
    `;
  },

  /** Crea el L.divIcon completo listo para usarse en L.marker(...). */
  crearAvatarMapa(L, opciones) {
    return L.divIcon({
      className: '',
      html: Iconos.htmlAvatarMapa(opciones),
      iconSize: [0, 0],
      iconAnchor: [17, 17],
    });
  },

  /**
   * Anima suavemente un marcador de Leaflet desde su posicion actual
   * hasta destino (interpolacion lineal), en vez del salto instantaneo
   * que hace marker.setLatLng() por defecto. Estilo "Google Maps".
   */
  animarMarcador(marker, destino, duracionMs = 900) {
    const origen = marker.getLatLng();
    const inicio = performance.now();

    // Si la distancia es enorme (p. ej. primer posicionamiento del
    // marcador), no tiene sentido animar: se coloca directo.
    if (Iconos.distanciaMetros(origen, destino) > 3000) {
      marker.setLatLng(destino);
      return;
    }

    function paso(ahora) {
      const t = Math.min(1, (ahora - inicio) / duracionMs);
      const avance = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
      const lat = origen.lat + (destino.lat - origen.lat) * avance;
      const lng = origen.lng + (destino.lng - origen.lng) * avance;
      marker.setLatLng([lat, lng]);
      if (t < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
  },
};

document.addEventListener('DOMContentLoaded', () => Iconos.aplicarEnPagina());
