// public/js/admin.js
// Login simple + carga y refresco periodico de excursionistas y alertas
// para el panel administrativo de la Municipalidad.

const INTERVALO_ACTUALIZACION_MS = 15000;
let mapaAdmin, capaMarcadores;

// --- Login ---
function sesionActiva() {
  return sessionStorage.getItem('admin_autenticado') === 'true';
}

function mostrarPanel() {
  document.getElementById('pantallaLogin').classList.add('d-none');
  document.getElementById('panelPrincipal').classList.remove('d-none');
  document.getElementById('btnCerrarSesion').classList.remove('d-none');
  iniciarPanel();
}

document.getElementById('btnLogin').addEventListener('click', async () => {
  const password = document.getElementById('inputPassword').value;
  const errorBox = document.getElementById('errorLogin');
  errorBox.classList.add('d-none');

  try {
    const respuesta = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok || !resultado.ok) {
      throw new Error(resultado.error || 'Contrasena incorrecta.');
    }
    sessionStorage.setItem('admin_autenticado', 'true');
    mostrarPanel();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
});

document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  sessionStorage.removeItem('admin_autenticado');
  window.location.reload();
});

if (sesionActiva()) {
  mostrarPanel();
}

// --- Panel principal ---
function iniciarPanel() {
  iniciarFichaRuta('fichaRutaAdmin');
  iniciarMapaAdmin();
  cargarDatos();
  cargarEstadoModelo();
  iniciarChatbot('admin');
  setInterval(cargarDatos, INTERVALO_ACTUALIZACION_MS);
  document.getElementById('btnActualizar').addEventListener('click', () => {
    cargarDatos();
    cargarEstadoModelo();
  });
}

async function cargarEstadoModelo() {
  const contenedor = document.getElementById('estadoModeloIA');
  if (!contenedor) return;

  try {
    const respuesta = await fetch('/api/asistente/estado-modelo');
    const estado = await respuesta.json();

    if (!estado.muestraSuficiente) {
      contenedor.innerHTML = `
        <div class="card p-3">
          <div class="chip mb-2">🤖 Modelo de Machine Learning</div>
          <div class="text-muted small">
            Aún no hay suficientes recorridos registrados para entrenar el modelo
            (tiene ${estado.totalMuestras}, necesita mínimo ${estado.muestrasMinimasRequeridas}).
            Mientras más gente use el sistema, el modelo empieza a predecir riesgo automáticamente.
          </div>
        </div>
      `;
      return;
    }

    const m = estado.metricas;
    contenedor.innerHTML = `
      <div class="card p-3">
        <div class="chip mb-2">🤖 Modelo de Machine Learning (regresión logística)</div>
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <div class="ficha-ruta-metrica-label">Entrenado con</div>
            <div class="ficha-ruta-metrica-valor">${estado.totalMuestras} recorridos</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="ficha-ruta-metrica-label">Exactitud</div>
            <div class="ficha-ruta-metrica-valor">${m.exactitud ?? '—'}%</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="ficha-ruta-metrica-label">Precisión</div>
            <div class="ficha-ruta-metrica-valor">${m.precision ?? '—'}%</div>
          </div>
          <div class="col-6 col-md-3">
            <div class="ficha-ruta-metrica-label">Exhaustividad</div>
            <div class="ficha-ruta-metrica-valor">${m.exhaustividad ?? '—'}%</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error al cargar estado del modelo:', error);
  }
}

function iniciarMapaAdmin() {
  mapaAdmin = L.map('mapa-admin').setView([14.4650, -90.7350], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(mapaAdmin);
  capaMarcadores = L.layerGroup().addTo(mapaAdmin);

  fetch('/api/ruta-referencia')
    .then((r) => r.json())
    .then((ruta) => {
      const puntos = ruta.map((p) => [p.lat, p.lng]);
      L.polyline(puntos, { color: '#2dd4bf', weight: 4, dashArray: '6 6' }).addTo(mapaAdmin);
    });

  // Marcadores con nombre de los puntos clave del recorrido (Capilla, Mirador, Cima, etc.)
  agregarPuntosReferencia(mapaAdmin);
}

async function cargarDatos() {
  await Promise.all([cargarExcursionistas(), cargarAlertas()]);
}

async function cargarExcursionistas() {
  try {
    const respuesta = await fetch('/api/excursionistas');
    const lista = await respuesta.json();

    const activos = lista.filter((e) => e.estado === 'activo');
    document.getElementById('contadorActivos').textContent = activos.length;
    document.getElementById('contadorCimas').textContent = lista.filter((e) => e.cumbreAlcanzada).length;

    // Tabla
    const cuerpoTabla = document.getElementById('tablaExcursionistas');
    cuerpoTabla.innerHTML = '';
    if (lista.length === 0) {
      cuerpoTabla.innerHTML = '<tr><td colspan="9" class="text-muted text-center">Aún no hay excursionistas registrados.</td></tr>';
    }

    lista.forEach((e) => {
      const ubicacion = e.ubicacionActual
        ? `${e.ubicacionActual.lat.toFixed(5)}, ${e.ubicacionActual.lng.toFixed(5)}`
        : 'Sin datos aún';

      const contacto = e.contactoEmergenciaTelefono
        ? `${escaparHtml(e.contactoEmergenciaNombre || 'Sin nombre')} &middot; ${escaparHtml(e.contactoEmergenciaTelefono)}`
        : '-';

      const cimaHtml = e.cumbreAlcanzada
        ? '<span class="chip">🏔️ Sí</span>'
        : '<span class="text-muted">—</span>';

      let retornoHtml = '<span class="text-muted">—</span>';
      if (e.estado === 'finalizado') {
        retornoHtml = e.retornoConfirmado
          ? '<span class="chip">✅ Confirmado</span>'
          : '<span class="chip">⚠️ Sin confirmar</span>';
      }

      const fila = document.createElement('tr');
      fila.className = e.estado === 'activo' ? 'card-estado-activo' : 'card-estado-finalizado';
      fila.innerHTML = `
        <td>${escaparHtml(e.nombre)}</td>
        <td>${escaparHtml(e.telefono || '-')}</td>
        <td>${contacto}</td>
        <td>${e.personasGrupo || 1}</td>
        <td><span class="badge ${e.estado === 'activo' ? 'bg-success' : 'bg-secondary'}">${e.estado}</span></td>
        <td>${cimaHtml}</td>
        <td>${retornoHtml}</td>
        <td>${ubicacion}</td>
        <td>
          ${e.estado === 'activo'
            ? `<button class="btn btn-sm btn-outline-secondary" onclick="finalizarExcursionista('${e.id}')">Marcar finalizado</button>`
            : ''
          }
        </td>
      `;
      cuerpoTabla.appendChild(fila);
    });

    // Mapa: un marcador por cada excursionista activo con ubicacion conocida
    capaMarcadores.clearLayers();
    activos
      .filter((e) => e.ubicacionActual)
      .forEach((e) => {
        const marcador = L.marker([e.ubicacionActual.lat, e.ubicacionActual.lng])
          .bindPopup(`<strong>${escaparHtml(e.nombre)}</strong><br>Grupo de ${e.personasGrupo || 1}`);
        capaMarcadores.addLayer(marcador);
      });
  } catch (error) {
    console.error('Error al cargar excursionistas:', error);
  }
}

async function cargarAlertas() {
  try {
    const respuesta = await fetch('/api/alertas');
    const lista = await respuesta.json();

    const sinAtender = lista.filter((a) => !a.atendida);
    document.getElementById('contadorAlertas').textContent = sinAtender.length;

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
            ? '<span class="text-muted small">Atendida</span>'
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

async function atenderAlerta(id) {
  await fetch(`/api/alertas/${id}/atender`, { method: 'PATCH' });
  cargarAlertas();
}

async function finalizarExcursionista(id) {
  const confirmar = confirm('¿Marcar este recorrido como finalizado?');
  if (!confirmar) return;
  await fetch(`/api/excursionistas/${id}/finalizar`, { method: 'PATCH' });
  cargarExcursionistas();
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
