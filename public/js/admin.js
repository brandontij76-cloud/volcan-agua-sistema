// public/js/admin.js
// Login simple + carga y refresco periodico de excursionistas y alertas
// para el panel administrativo de la Municipalidad.

const INTERVALO_ACTUALIZACION_MS = 15000;
let mapaAdmin, capaMarcadores;
let mapaTiempoReal, capaMarcadoresTiempoReal;
let pestanasIniciadas = { tiemporeal: false, estadisticas: false, agencias: false, colaboradores: false };

// --- Login ---
// El servidor entrega un token firmado al iniciar sesion correctamente, y
// hay que reenviarlo (header Authorization) en cada peticion protegida --
// antes, el servidor no verificaba nada y cualquiera podia llamar la API
// directamente sin haber iniciado sesion.
function sesionActiva() {
  return Boolean(sessionStorage.getItem('admin_token'));
}

function tokenAdmin() {
  return sessionStorage.getItem('admin_token');
}

// Envoltorio de fetch que agrega automaticamente el token a cada peticion.
// Si el servidor responde 401 (token invalido o expirado), cierra la
// sesion y regresa a la pantalla de login en vez de dejar la pantalla en
// un estado a medias.
async function fetchAdmin(url, opciones = {}) {
  const encabezados = { ...(opciones.headers || {}), Authorization: `Bearer ${tokenAdmin()}` };
  const respuesta = await fetch(url, { ...opciones, headers: encabezados });
  if (respuesta.status === 401) {
    sessionStorage.removeItem('admin_token');
    alert('Tu sesion expiro. Vuelve a iniciar sesion.');
    window.location.reload();
    throw new Error('Sesion expirada.');
  }
  return respuesta;
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
    sessionStorage.setItem('admin_token', resultado.token);
    mostrarPanel();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
});

document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  sessionStorage.removeItem('admin_token');
  window.location.reload();
});

if (sesionActiva()) {
  mostrarPanel();
}

// Descarga un archivo desde una ruta protegida (necesita el token en el
// header, algo que un <a href="..."> normal no puede hacer): pide el
// archivo con fetchAdmin, arma un enlace temporal con el resultado y lo
// "clickea" solo, conservando el nombre de archivo que manda el servidor.
async function descargarArchivoProtegido(url) {
  const respuesta = await fetchAdmin(url);
  if (!respuesta.ok) {
    alert('No se pudo descargar el archivo.');
    return;
  }
  const disposicion = respuesta.headers.get('Content-Disposition') || '';
  const coincidencia = disposicion.match(/filename="([^"]+)"/);
  const nombreArchivo = coincidencia ? coincidencia[1] : 'descarga.xlsx';

  const blob = await respuesta.blob();
  const urlTemporal = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = urlTemporal;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(urlTemporal);
}

document.getElementById('btnExportarExcel').addEventListener('click', () => {
  descargarArchivoProtegido('/api/admin/exportar');
});
document.getElementById('btnDescargarReporteExcel').addEventListener('click', () => {
  descargarArchivoProtegido('/api/admin/reporte-semanal/excel');
});

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

  iniciarPestanas();
}

// --- Pestañas: Tiempo real / Estadísticas / Agencias / Colaboradores ---
// Cada pestaña se inicializa la primera vez que se abre (asi no se crean
// mapas ocultos, que Leaflet no dibuja bien con contenedor en d-none).
function iniciarPestanas() {
  document.getElementById('tab-btn-tiemporeal').addEventListener('shown.bs.tab', () => {
    if (!pestanasIniciadas.tiemporeal) {
      iniciarMapaTiempoReal();
      pestanasIniciadas.tiemporeal = true;
    }
    cargarTiempoReal();
  });

  document.getElementById('tab-btn-estadisticas').addEventListener('shown.bs.tab', () => {
    cargarEstadisticas();
  });
  document.getElementById('btnActualizarEstadisticas').addEventListener('click', cargarEstadisticas);
  document.getElementById('btnGenerarReporteSemanal').addEventListener('click', generarReporteSemanal);

  document.getElementById('tab-btn-agencias').addEventListener('shown.bs.tab', () => {
    if (!pestanasIniciadas.agencias) {
      cargarAgencias();
      pestanasIniciadas.agencias = true;
    }
  });
  document.getElementById('btnCrearAgencia').addEventListener('click', crearAgencia);

  document.getElementById('tab-btn-colaboradores').addEventListener('shown.bs.tab', () => {
    if (!pestanasIniciadas.colaboradores) {
      cargarColaboradores();
      pestanasIniciadas.colaboradores = true;
    }
  });
  document.getElementById('btnCrearColaborador').addEventListener('click', crearColaborador);

  // Refresca el mapa de tiempo real junto con el resto de datos, solo si
  // la pestaña ya fue abierta al menos una vez (para no gastar llamadas
  // de mas si el administrador nunca la usa).
  setInterval(() => {
    if (pestanasIniciadas.tiemporeal) cargarTiempoReal();
  }, INTERVALO_ACTUALIZACION_MS);
}

// --- Tiempo real: mapa tipo "Google Maps" con avatar y cono de direccion ---
let marcadoresTiempoReal = new Map(); // id excursionista -> { marker, posicion }

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
      L.polyline(puntos, { color: '#22c55e', weight: 4, dashArray: '6 6' }).addTo(mapaTiempoReal);
    });

  agregarPuntosReferencia(mapaTiempoReal);
}

const UMBRAL_MOVIMIENTO_M = 4;

async function cargarTiempoReal() {
  if (!mapaTiempoReal) return;
  try {
    const respuesta = await fetchAdmin('/api/excursionistas?estado=activo');
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

          existente.marker.setIcon(Iconos.crearAvatarMapa(L, { etiqueta, rumbo, enMovimiento: seMovio, variante: 'excursionista' }));
          Iconos.animarMarcador(existente.marker, [nuevaPosicion.lat, nuevaPosicion.lng]);
          existente.posicion = nuevaPosicion;
          existente.rumbo = rumbo;
        } else {
          const marcador = L.marker([nuevaPosicion.lat, nuevaPosicion.lng], {
            icon: Iconos.crearAvatarMapa(L, { etiqueta, rumbo: 0, enMovimiento: false, variante: 'excursionista' }),
          }).bindPopup(`<strong>${escaparHtml(e.nombre)}</strong><br>Grupo de ${e.personasGrupo || 1}`);
          capaMarcadoresTiempoReal.addLayer(marcador);
          marcadoresTiempoReal.set(e.id, { marker: marcador, posicion: nuevaPosicion, rumbo: 0 });
        }
      });

    // Quita del mapa a quienes ya no estan activos (finalizaron, etc.)
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

// --- Estadísticas semanales ---
async function cargarEstadisticas() {
  const contenedor = document.getElementById('contenedorEstadisticas');
  contenedor.innerHTML = '<p class="text-muted">Cargando estadísticas…</p>';
  try {
    const respuesta = await fetchAdmin('/api/admin/estadisticas');
    const r = await respuesta.json();

    const filasAtencion = (r.detalleAtencion || []).length
      ? r.detalleAtencion.map((a) => `
          <tr>
            <td>${escaparHtml(a.excursionista || '-')}</td>
            <td><span class="badge badge-nivel-${a.nivel || 'leve'}">${a.nivel || '-'}</span></td>
            <td>${escaparHtml(a.atendidaPor || 'No especificado')}</td>
            <td>${a.fechaAtencion ? new Date(a.fechaAtencion).toLocaleString('es-GT') : '-'}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="text-muted text-center">Sin alertas atendidas esta semana.</td></tr>';

    const hayAlertasSinAtender = r.alertasSinAtender > 0;

    contenedor.innerHTML = `
      <div class="tarjeta-estado-grande mb-3">
        <div class="estado-punto">${Iconos.svg('brujula', 22)}</div>
        <div>
          <div class="estado-eyebrow">Ahora mismo</div>
          <div class="estado-valor">${r.activos} excursionista${r.activos === 1 ? '' : 's'} en ruta</div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-md-4">
          <div class="stat-card">
            <div class="stat-numero">${r.totalRegistrados}</div>
            <div class="stat-label">Registrados esta semana</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card">
            <div class="stat-numero" style="color:var(--lavanda)">${r.cimaAlcanzada}</div>
            <div class="stat-label">Llegaron a la cima</div>
          </div>
        </div>
        <div class="col-md-4">
          <div class="stat-card">
            <div class="stat-numero" style="color:${hayAlertasSinAtender ? 'var(--alerta-grave)' : 'var(--exito)'}">${r.alertasSinAtender}</div>
            <div class="stat-label">Alertas sin atender</div>
          </div>
        </div>
      </div>

      <div class="fila-metricas-agrupadas mb-4">
        <div class="metrica-grupo">
          <div class="metrica-numero">${r.finalizados}</div>
          <div class="metrica-label">Finalizaron</div>
        </div>
        <div class="metrica-grupo">
          <div class="metrica-numero" style="color:var(--alerta-moderada)">${r.sinTerminarODesviados}</div>
          <div class="metrica-label">Sin terminar / en ruta</div>
        </div>
        <div class="metrica-grupo">
          <div class="metrica-numero" style="color:var(--exito)">${r.alertasAtendidas}</div>
          <div class="metrica-label">Alertas atendidas</div>
        </div>
        <div class="metrica-grupo">
          <div class="metrica-numero">${r.totalAlertas}</div>
          <div class="metrica-label">Total de alertas</div>
        </div>
      </div>

      <h6 class="mb-3">Emergencias atendidas esta semana — quién las atendió</h6>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Excursionista</th>
              <th>Nivel</th>
              <th>Atendida por</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>${filasAtencion}</tbody>
        </table>
      </div>
      <p class="text-muted small mt-2">
        Resumen calculado sobre los últimos 7 días. Usa "Descargar Excel" en la pestaña Resumen
        para el detalle completo agrupado por agencia.
      </p>
    `;
  } catch (error) {
    console.error('Error al cargar estadisticas:', error);
    contenedor.innerHTML = '<p class="text-danger">No se pudieron cargar las estadísticas.</p>';
  }
}

// --- Reporte semanal redactado por IA (lunes a domingo) ---
async function generarReporteSemanal() {
  const contenedor = document.getElementById('contenedorReporteSemanal');
  const btn = document.getElementById('btnGenerarReporteSemanal');

  btn.disabled = true;
  btn.textContent = 'Generando...';
  contenedor.innerHTML = '<p class="text-muted">Analizando los datos de la semana y redactando el reporte…</p>';

  try {
    const respuesta = await fetchAdmin('/api/admin/reporte-semanal');
    const r = await respuesta.json();
    if (!respuesta.ok) throw new Error(r.error || 'No se pudo generar el reporte.');

    const insigniaIA = r.generadoConIA
      ? `<span class="chip">${Iconos.svg('destello', 13)} Redactado con IA (Gemini)</span>`
      : `<span class="chip">${Iconos.svg('robot', 13)} Redactado por reglas (IA no disponible en este momento)</span>`;

    contenedor.innerHTML = `
      <div class="card p-3 p-md-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <h6 class="mb-0">Semana del ${escaparHtml(r.rangoSemana.texto)}</h6>
          ${insigniaIA}
        </div>
        <p class="mb-0" style="white-space: pre-line;">${escaparHtml(r.reporte)}</p>
      </div>
    `;
  } catch (error) {
    console.error('Error al generar el reporte semanal:', error);
    contenedor.innerHTML = '<p class="text-danger">No se pudo generar el reporte semanal. Intenta de nuevo.</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generar reporte con IA';
  }
}

// --- Agencias turísticas ---
async function cargarAgencias() {
  const cuerpo = document.getElementById('tablaAgencias');
  try {
    const respuesta = await fetch('/api/agencias');
    const lista = await respuesta.json();

    // Tambien alimenta el selector de "cargar lista de excursionistas".
    const selectLista = document.getElementById('selectAgenciaLista');
    const valorPrevio = selectLista.value;
    selectLista.innerHTML = '<option value="">Selecciona una agencia…</option>';
    lista.forEach((a) => {
      const opcion = document.createElement('option');
      opcion.value = a.id;
      opcion.textContent = a.nombre;
      selectLista.appendChild(opcion);
    });
    if (valorPrevio) selectLista.value = valorPrevio;

    cuerpo.innerHTML = '';
    if (lista.length === 0) {
      cuerpo.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Aún no hay agencias registradas.</td></tr>';
      return;
    }
    lista.forEach((a) => {
      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${escaparHtml(a.nombre)}</td>
        <td>${escaparHtml(a.representante || '-')}</td>
        <td>${escaparHtml(a.telefono || '-')}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarAgencia('${a.id}')">Eliminar</button></td>
      `;
      cuerpo.appendChild(fila);
    });
  } catch (error) {
    console.error('Error al cargar agencias:', error);
    cuerpo.innerHTML = '<tr><td colspan="4" class="text-danger text-center">No se pudieron cargar las agencias.</td></tr>';
  }
}

async function crearAgencia() {
  const nombre = document.getElementById('inputAgenciaNombre').value.trim();
  const representante = document.getElementById('inputAgenciaRepresentante').value.trim();
  const telefono = document.getElementById('inputAgenciaTelefono').value.trim();
  const errorBox = document.getElementById('errorAgencia');
  errorBox.classList.add('d-none');

  try {
    const respuesta = await fetchAdmin('/api/agencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, representante, telefono }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo registrar la agencia.');

    document.getElementById('inputAgenciaNombre').value = '';
    document.getElementById('inputAgenciaRepresentante').value = '';
    document.getElementById('inputAgenciaTelefono').value = '';
    cargarAgencias();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
}

async function eliminarAgencia(id) {
  const confirmar = confirm('¿Eliminar esta agencia? Los excursionistas ya asociados no se eliminan.');
  if (!confirmar) return;
  await fetchAdmin(`/api/agencias/${id}`, { method: 'DELETE' });
  cargarAgencias();
}

// --- Cargar lista de excursionistas de una agencia (nombre + telefono) ---
function horaSalidaListaA24h() {
  const horaSel = document.getElementById('horaSalidaListaHora').value;
  const minutoSel = document.getElementById('horaSalidaListaMinuto').value;
  const periodoSel = document.getElementById('horaSalidaListaPeriodo').value;
  if (!horaSel) return '';
  let hora24 = parseInt(horaSel, 10) % 12;
  if (periodoSel === 'PM') hora24 += 12;
  return `${String(hora24).padStart(2, '0')}:${minutoSel}`;
}

function parsearListaAgencia(texto) {
  return texto
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0)
    .map((linea) => {
      const idx = linea.indexOf(',');
      if (idx === -1) return { nombre: linea.trim(), telefono: '' };
      return {
        nombre: linea.slice(0, idx).trim(),
        telefono: linea.slice(idx + 1).trim(),
      };
    });
}

document.getElementById('selectAgenciaLista').addEventListener('change', cargarListaAgenciaTabla);
document.getElementById('btnActualizarListaAgencia').addEventListener('click', cargarListaAgenciaTabla);
document.getElementById('btnCargarListaAgencia').addEventListener('click', cargarListaAgencia);

async function cargarListaAgenciaTabla() {
  const agenciaId = document.getElementById('selectAgenciaLista').value;
  const cuerpo = document.getElementById('tablaListaAgencia');
  if (!agenciaId) {
    cuerpo.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Selecciona una agencia para ver su lista.</td></tr>';
    return;
  }
  cuerpo.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Cargando…</td></tr>';
  try {
    const respuesta = await fetchAdmin(`/api/excursionistas/agencia/${agenciaId}/completo`);
    const lista = await respuesta.json();
    if (lista.length === 0) {
      cuerpo.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Esta agencia aún no tiene ninguna lista cargada.</td></tr>';
      return;
    }
    cuerpo.innerHTML = lista.map((p) => `
      <tr>
        <td>${escaparHtml(p.nombre)}</td>
        <td>${escaparHtml(p.telefono || '-')}</td>
        <td>${p.estado === 'pendiente' ? `<span class="chip">${Iconos.svg('reloj', 14)} Pendiente</span>` : `<span class="chip">${Iconos.svg('check', 14)} Confirmado</span>`}</td>
        <td><button class="btn btn-sm btn-outline-danger" onclick="eliminarPersonaListaAgencia('${p.id}')">Eliminar</button></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error al cargar la lista de la agencia:', error);
    cuerpo.innerHTML = '<tr><td colspan="4" class="text-danger text-center">No se pudo cargar la lista.</td></tr>';
  }
}

async function eliminarPersonaListaAgencia(id) {
  const confirmar = confirm('¿Eliminar a esta persona de la lista de la agencia?');
  if (!confirmar) return;
  await fetchAdmin(`/api/excursionistas/${id}`, { method: 'DELETE' });
  cargarListaAgenciaTabla();
}

async function cargarListaAgencia() {
  const errorBox = document.getElementById('errorListaAgencia');
  const exitoBox = document.getElementById('exitoListaAgencia');
  errorBox.classList.add('d-none');
  exitoBox.classList.add('d-none');

  const agenciaId = document.getElementById('selectAgenciaLista').value;
  const fechaSalidaEstimada = document.getElementById('fechaSalidaLista').value;
  const horaSalidaEstimada = horaSalidaListaA24h();
  const personas = parsearListaAgencia(document.getElementById('textareaListaAgencia').value);

  if (!agenciaId) {
    errorBox.textContent = 'Selecciona la agencia.';
    errorBox.classList.remove('d-none');
    return;
  }
  if (!fechaSalidaEstimada || !horaSalidaEstimada) {
    errorBox.textContent = 'Indica el día y la hora de salida del grupo.';
    errorBox.classList.remove('d-none');
    return;
  }
  if (personas.length === 0) {
    errorBox.textContent = 'Escribe al menos una persona (una por línea: Nombre completo, Teléfono).';
    errorBox.classList.remove('d-none');
    return;
  }

  const btn = document.getElementById('btnCargarListaAgencia');
  btn.disabled = true;
  btn.textContent = 'Cargando...';

  try {
    const respuesta = await fetchAdmin(`/api/excursionistas/agencia/${agenciaId}/lista`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personas, fechaSalidaEstimada, horaSalidaEstimada }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo cargar la lista.');

    exitoBox.innerHTML = `${Iconos.svg('check', 15)} Se cargaron ${resultado.creados} excursionista(s). Ya pueden buscar su nombre en el registro público.`;
    exitoBox.classList.remove('d-none');
    document.getElementById('textareaListaAgencia').value = '';
    cargarListaAgenciaTabla();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cargar lista';
  }
}

// --- Colaboradores (acceso limitado a Tiempo real) ---
async function cargarColaboradores() {
  const cuerpo = document.getElementById('tablaColaboradores');
  try {
    const respuesta = await fetchAdmin('/api/colaboradores');
    const lista = await respuesta.json();

    cuerpo.innerHTML = '';
    if (lista.length === 0) {
      cuerpo.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Aún no hay colaboradores registrados.</td></tr>';
      return;
    }
    lista.forEach((c) => {
      const accesos = Object.values(c.historialAccesos || {})
        .sort((a, b) => b.fecha - a.fecha)
        .slice(0, 3)
        .map((acc) => new Date(acc.fecha).toLocaleString('es-GT'))
        .join('<br>') || '<span class="text-muted">Sin accesos aún</span>';

      const fila = document.createElement('tr');
      fila.innerHTML = `
        <td>${escaparHtml(c.nombre)}</td>
        <td>${escaparHtml(c.usuario)}</td>
        <td>
          <span class="badge ${c.activo ? 'bg-success' : 'bg-secondary'}">${c.activo ? 'Activo' : 'Desactivado'}</span>
        </td>
        <td class="small">${accesos}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary mb-1" onclick="cambiarEstadoColaborador('${c.id}', ${!c.activo})">
            ${c.activo ? 'Desactivar' : 'Activar'}
          </button>
          <button class="btn btn-sm btn-outline-danger mb-1" onclick="eliminarColaborador('${c.id}')">Eliminar</button>
        </td>
      `;
      cuerpo.appendChild(fila);
    });
  } catch (error) {
    console.error('Error al cargar colaboradores:', error);
    cuerpo.innerHTML = '<tr><td colspan="5" class="text-danger text-center">No se pudieron cargar los colaboradores.</td></tr>';
  }
}

async function crearColaborador() {
  const nombre = document.getElementById('inputColaboradorNombre').value.trim();
  const usuario = document.getElementById('inputColaboradorUsuario').value.trim();
  const password = document.getElementById('inputColaboradorPassword').value;
  const errorBox = document.getElementById('errorColaborador');
  errorBox.classList.add('d-none');

  try {
    const respuesta = await fetchAdmin('/api/colaboradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, usuario, password }),
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || 'No se pudo crear el colaborador.');

    document.getElementById('inputColaboradorNombre').value = '';
    document.getElementById('inputColaboradorUsuario').value = '';
    document.getElementById('inputColaboradorPassword').value = '';
    cargarColaboradores();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove('d-none');
  }
}

async function cambiarEstadoColaborador(id, activo) {
  await fetchAdmin(`/api/colaboradores/${id}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo }),
  });
  cargarColaboradores();
}

async function eliminarColaborador(id) {
  const confirmar = confirm('¿Eliminar esta cuenta de colaborador? Ya no podrá iniciar sesión.');
  if (!confirmar) return;
  await fetchAdmin(`/api/colaboradores/${id}`, { method: 'DELETE' });
  cargarColaboradores();
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
          <div class="chip mb-2">${Iconos.svg('robot', 14)} Modelo de IA</div>
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
        <div class="chip mb-2">${Iconos.svg('robot', 14)} Modelo de IA (regresión logística)</div>
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
      L.polyline(puntos, { color: '#22c55e', weight: 4, dashArray: '6 6' }).addTo(mapaAdmin);
    });

  // Marcadores con nombre de los puntos clave del recorrido (Capilla, Mirador, Cima, etc.)
  agregarPuntosReferencia(mapaAdmin);
}

async function cargarDatos() {
  await Promise.all([cargarExcursionistas(), cargarAlertas()]);
}

async function cargarExcursionistas() {
  try {
    const respuesta = await fetchAdmin('/api/excursionistas');
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
        ? `<span class="chip">${Iconos.svg('montana', 14)} Sí</span>`
        : '<span class="text-muted">—</span>';

      let retornoHtml = '<span class="text-muted">—</span>';
      if (e.estado === 'finalizado') {
        retornoHtml = e.retornoConfirmado
          ? `<span class="chip">${Iconos.svg('check', 14)} Confirmado</span>`
          : `<span class="chip">${Iconos.svg('advertencia', 14)} Sin confirmar</span>`;
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
    const respuesta = await fetchAdmin('/api/alertas');
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

async function atenderAlerta(id) {
  const atendidaPor = prompt('¿Quién está atendiendo esta alerta? Escribe tu nombre:');
  if (!atendidaPor || !atendidaPor.trim()) return;
  await fetchAdmin(`/api/alertas/${id}/atender`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ atendidaPor: atendidaPor.trim() }),
  });
  cargarAlertas();
}

async function finalizarExcursionista(id) {
  const confirmar = confirm('¿Marcar este recorrido como finalizado?');
  if (!confirmar) return;
  await fetchAdmin(`/api/excursionistas/${id}/finalizar`, { method: 'PATCH' });
  cargarExcursionistas();
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}
