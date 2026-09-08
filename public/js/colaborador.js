// public/js/colaborador.js
// Acceso limitado para las personas en la cima que atienden excursionistas.
// Solo ven el mapa de "tiempo real" (quien esta subiendo ahora) y pueden
// marcar alertas como atendidas con su propio nombre. No tienen acceso al
// resto del panel administrativo (estadisticas, agencias, colaboradores,
// exportacion, etc.).

const INTERVALO_ACTUALIZACION_MS = 15000;
let mapaTiempoReal, capaMarcadoresTiempoReal;
let colaboradorActual = null;

function sesionActiva() {
  const guardado = sessionStorage.getItem('colaborador_actual');
  return guardado ? JSON.parse(guardado) : null;
}

function mostrarPanel(colaborador) {
  colaboradorActual = colaborador;
  document.getElementById('pantallaLogin').classList.add('d-none');
  document.getElementById('panelColaborador').classList.remove('d-none');
  document.getElementById('btnCerrarSesion').classList.remove('d-none');
  document.getElementById('nombreColaborador').textContent = colaborador.nombre;
  iniciarMapaTiempoReal();
  cargarDatos();
  setInterval(cargarDatos, INTERVALO_ACTUALIZACION_MS);
}

document.getElementById('btnLogin').addEventListener('click', async () => {
  const usuario = document.getElementById('inputUsuario').value.trim();
  const password = document.getElementById('inputPassword').value;
  const errorBox = document.getElementById('errorLogin');
  errorBox.classList.add('d-none');

  try {
    const respuesta = await fetch('/api/colaboradores/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(resultado.error || 'Usuario o contraseña incorrectos.');
    }
    sessionStorage.setItem('colaborador_actual', JSON.stringify(resultado));
    mostrarPanel(resultado);
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
});

document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  sessionStorage.removeItem('colaborador_actual');
  window.location.reload();
});

const sesionGuardada = sesionActiva();
if (sesionGuardada) {
  mostrarPanel(sesionGuardada);
}

// --- Mapa de tiempo real (igual al del panel administrativo) ---
let marcadoresTiempoReal = new Map(); // id excursionista -> { marker, posicion, rumbo }

function iniciarMapaTiempoReal() {
  mapaTiempoReal = L.map('mapa-tiemporeal').setView([14.4650, -90.7350], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(mapaTiempoReal);
  capaMarcadoresTiempoReal = L.layerGroup().addTo(mapaTiempoReal);
  marcadoresTiempoReal = new Map();

  fetch('/api/ruta-referencia')
    .then((r) => r.json())
    .then((ruta) => {
      const puntos = ruta.map((p) => [p.lat, p.lng]);
      L.polyline(puntos, { color: '#2dd4bf', weight: 4, dashArray: '6 6' }).addTo(mapaTiempoReal);
    });

  agregarPuntosReferencia(mapaTiempoReal);
}

async function cargarDatos() {
  await Promise.all([cargarTiempoReal(), cargarAlertas()]);
}

const UMBRAL_MOVIMIENTO_M = 4;

async function cargarTiempoReal() {
  try {
    const respuesta = await fetch('/api/excursionistas?estado=activo');
    const activos = await respuesta.json();

    document.getElementById('contadorEnRuta').textContent = activos.length;

    const idsActivos = new Set();
    activos
      .filter((e) => e.ubicacionActual)
      .forEach((e) => {
        idsActivos.add(e.id);
        const km = e.ubicacionActual.kmRecorridos != null ? ` · ${e.ubicacionActual.kmRecorridos.toFixed(1)} km` : '';
        const etiqueta = escaparHtml((e.personasGrupo > 1 ? `${e.nombre} (+${e.personasGrupo - 1})` : e.nombre) + km);
        const nuevaPosicion = { lat: e.ubicacionActual.lat, lng: e.ubicacionActual.lng };

        const existente = marcadoresTiempoReal.get(e.id);
        if (existente) {
          const distancia = Iconos.distanciaMetros(existente.posicion, nuevaPosicion);
          const seMovio = distancia >= UMBRAL_MOVIMIENTO_M;
          const rumbo = seMovio ? Iconos.calcularRumbo(existente.posicion, nuevaPosicion) : existente.rumbo || 0;

          existente.marker.setIcon(Iconos.crearAvatarMapa(L, { etiqueta, rumbo, enMovimiento: seMovio, variante: 'colaborador' }));
          Iconos.animarMarcador(existente.marker, [nuevaPosicion.lat, nuevaPosicion.lng]);
          existente.posicion = nuevaPosicion;
          existente.rumbo = rumbo;
        } else {
          const marcador = L.marker([nuevaPosicion.lat, nuevaPosicion.lng], {
            icon: Iconos.crearAvatarMapa(L, { etiqueta, rumbo: 0, enMovimiento: false, variante: 'colaborador' }),
          }).bindPopup(`<strong>${escaparHtml(e.nombre)}</strong><br>Grupo de ${e.personasGrupo || 1}`);
          capaMarcadoresTiempoReal.addLayer(marcador);
          marcadoresTiempoReal.set(e.id, { marker: marcador, posicion: nuevaPosicion, rumbo: 0 });
        }
      });

    marcadoresTiempoReal.forEach((valor, id) => {
      if (!idsActivos.has(id)) {
        capaMarcadoresTiempoReal.removeLayer(valor.marker);
        marcadoresTiempoReal.delete(id);
      }
    });
  } catch (error) {
    console.error('Error al cargar el mapa de tiempo real:', error);
  }
}

async function cargarAlertas() {
  try {
    const respuesta = await fetch('/api/alertas');
    const lista = await respuesta.json();

    const cuerpoTabla = document.getElementById('tablaAlertas');
    cuerpoTabla.innerHTML = '';

    if (lista.length === 0) {
      cuerpoTabla.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Sin alertas por el momento.</td></tr>';
      return;
    }

    lista.forEach((a) => {
      const fila = document.createElement('tr');
      if (!a.atendida) fila.classList.add('alerta-fila-no-atendida');
      const hora = new Date(a.timestamp).toLocaleTimeString('es-GT');
      const contadorOcurrencias = a.ocurrencias > 1
        ? ` <span class="chip">×${a.ocurrencias}</span>`
        : '';
      fila.innerHTML = `
        <td>${escaparHtml(a.excursionistaNombre || '-')}</td>
        <td><span class="badge badge-nivel-${a.nivel}">${a.nivel}</span></td>
        <td>${escaparHtml(a.mensaje || '-')}${contadorOcurrencias}</td>
        <td>${hora}</td>
        <td>
          ${a.atendida
            ? `<span class="text-muted small">Atendida por ${escaparHtml(a.atendidaPor || 'No especificado')}</span>`
            : `<button class="btn btn-sm btn-volcan" onclick="atenderAlerta('${a.id}')">Atender</button>`
          }
        </td>
      `;
      cuerpoTabla.appendChild(fila);
    });
  } catch (error) {
    console.error('Error al cargar alertas:', error);
  }
}

// Usa automaticamente el nombre del colaborador que inicio sesion (no hace
// falta que lo escriba cada vez, a diferencia del panel de administrador).
async function atenderAlerta(id) {
  const confirmar = confirm(`¿Marcar esta alerta como atendida por ${colaboradorActual.nombre}?`);
  if (!confirmar) return;
  await fetch(`/api/alertas/${id}/atender`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ atendidaPor: colaboradorActual.nombre }),
  });
  cargarAlertas();
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
