// services/deteccionAnomalias.js
//
// Este modulo implementa, de forma simplificada, los 3 componentes descritos
// en el capitulo III del proyecto (seccion 3.10):
//   3.10.1 Deteccion de anomalias en rutas (desviacion del camino planificado)
//   3.10.2 Alertas predictivas basadas en patrones de movimiento (inactividad)
//   3.10.3 Clasificacion automatica de niveles de emergencia
//
// No usa un modelo de machine learning entrenado para esta parte especifica
// (esa parte vive en services/modeloRiesgoIA.js). Aqui se usan reglas
// basadas en distancia/tiempo, comparando siempre contra la RUTA REAL
// registrada con GPS (ver abajo), no una aproximacion.

// ---------------------------------------------------------------------
// RUTA REAL DEL VOLCAN DE AGUA (version oficial/municipal)
// Extraida de un archivo KMZ grabado especificamente para este proyecto,
// con puntos de referencia reales a lo largo del camino (Capilla, Fin de
// tramo vehicular, Mirador Canal 3, Inicio del zig zag, y la Cima).
// Se simplifico de 424 puntos GPS originales a 213 (cada 2do punto),
// conservando la forma real del sendero.
//
// Distancia de ida calculada: 9.53 km (~19.06 km ida y vuelta).
// El desnivel (1763 m) se mantiene del dato oficial previamente conocido,
// ya que este KMZ no incluye informacion de altitud.
// ---------------------------------------------------------------------
const RUTA_REFERENCIA_VOLCAN_DE_AGUA = [
  { lat: 14.502745, lng: -90.714459 },  // Inicio de la traza (cerca de la Municipalidad)
  { lat: 14.502411, lng: -90.710954 },
  { lat: 14.501582, lng: -90.709701 },
  { lat: 14.499197, lng: -90.710250 },
  { lat: 14.498679, lng: -90.710702 },
  { lat: 14.497426, lng: -90.710172 },
  { lat: 14.496654, lng: -90.710577 },
  { lat: 14.494494, lng: -90.709653 },
  { lat: 14.494217, lng: -90.710359 },
  { lat: 14.494499, lng: -90.711210 },
  { lat: 14.493476, lng: -90.712230 },
  { lat: 14.492229, lng: -90.713092 },
  { lat: 14.490617, lng: -90.714728 },
  { lat: 14.488560, lng: -90.717083 },
  { lat: 14.487999, lng: -90.718375 },
  { lat: 14.487453, lng: -90.719571 },
  { lat: 14.486510, lng: -90.720749 },
  { lat: 14.485743, lng: -90.721206 },
  { lat: 14.485066, lng: -90.721676 },
  { lat: 14.484050, lng: -90.722104 },
  { lat: 14.483321, lng: -90.722374 },
  { lat: 14.483089, lng: -90.722238 },
  { lat: 14.482811, lng: -90.722508 },
  { lat: 14.482482, lng: -90.722840 },
  { lat: 14.482119, lng: -90.723027 },
  { lat: 14.481921, lng: -90.723159 },
  { lat: 14.481831, lng: -90.723408 },
  { lat: 14.481865, lng: -90.723922 },
  { lat: 14.482095, lng: -90.724330 },
  { lat: 14.481851, lng: -90.724536 },
  { lat: 14.481627, lng: -90.724673 },
  { lat: 14.481199, lng: -90.724535 },
  { lat: 14.481162, lng: -90.724397 },
  { lat: 14.481046, lng: -90.724784 },
  { lat: 14.481031, lng: -90.725133 },
  { lat: 14.480995, lng: -90.725382 },
  { lat: 14.480697, lng: -90.725428 },
  { lat: 14.480354, lng: -90.725266 },
  { lat: 14.479730, lng: -90.725101 },
  { lat: 14.479408, lng: -90.725134 },
  { lat: 14.479470, lng: -90.725401 },
  { lat: 14.479733, lng: -90.725692 },
  { lat: 14.479891, lng: -90.725946 },
  { lat: 14.479038, lng: -90.726043 },
  { lat: 14.478299, lng: -90.725994 },
  { lat: 14.477841, lng: -90.725655 },
  { lat: 14.477471, lng: -90.725490 },
  { lat: 14.477070, lng: -90.725540 },
  { lat: 14.476846, lng: -90.725613 },
  { lat: 14.476883, lng: -90.725829 },
  { lat: 14.477140, lng: -90.726071 },
  { lat: 14.477409, lng: -90.726352 },
  { lat: 14.477818, lng: -90.726805 },
  { lat: 14.478231, lng: -90.727285 },
  { lat: 14.478120, lng: -90.727434 },
  { lat: 14.477683, lng: -90.727315 },
  { lat: 14.477421, lng: -90.727198 },
  { lat: 14.477255, lng: -90.727101 },
  { lat: 14.476751, lng: -90.726923 },
  { lat: 14.476360, lng: -90.727102 },
  { lat: 14.476216, lng: -90.727335 },
  { lat: 14.476232, lng: -90.727816 },
  { lat: 14.476578, lng: -90.728219 },
  { lat: 14.476802, lng: -90.728509 },
  { lat: 14.477037, lng: -90.728794 },
  { lat: 14.477253, lng: -90.728986 },
  { lat: 14.477438, lng: -90.729154 },
  { lat: 14.477484, lng: -90.729394 },
  { lat: 14.477501, lng: -90.729860 },
  { lat: 14.477303, lng: -90.730189 },
  { lat: 14.477335, lng: -90.730652 },
  { lat: 14.477479, lng: -90.730990 },
  { lat: 14.477469, lng: -90.731416 },
  { lat: 14.477453, lng: -90.731852 },
  { lat: 14.477591, lng: -90.732241 },
  { lat: 14.477579, lng: -90.732603 },
  { lat: 14.477381, lng: -90.732822 },
  { lat: 14.477301, lng: -90.732726 },
  { lat: 14.477061, lng: -90.732503 },
  { lat: 14.476890, lng: -90.732471 },
  { lat: 14.476727, lng: -90.732295 },
  { lat: 14.476444, lng: -90.732078 },
  { lat: 14.476282, lng: -90.731812 },
  { lat: 14.475976, lng: -90.731678 },
  { lat: 14.475393, lng: -90.731102 },
  { lat: 14.474827, lng: -90.731153 },
  { lat: 14.474474, lng: -90.731110 },
  { lat: 14.474156, lng: -90.731192 },
  { lat: 14.474184, lng: -90.731536 },
  { lat: 14.474548, lng: -90.731776 },
  { lat: 14.474762, lng: -90.732015 },
  { lat: 14.475109, lng: -90.732537 },
  { lat: 14.474914, lng: -90.733091 },
  { lat: 14.474815, lng: -90.733579 },
  { lat: 14.474879, lng: -90.734129 },
  { lat: 14.475104, lng: -90.734401 },
  { lat: 14.475217, lng: -90.734644 },
  { lat: 14.475266, lng: -90.734862 },
  { lat: 14.475079, lng: -90.734768 },
  { lat: 14.474796, lng: -90.734712 },
  { lat: 14.474478, lng: -90.734532 },
  { lat: 14.474195, lng: -90.734219 },
  { lat: 14.473979, lng: -90.734112 },
  { lat: 14.473991, lng: -90.734367 },
  { lat: 14.474005, lng: -90.734564 },
  { lat: 14.474079, lng: -90.734960 },
  { lat: 14.474079, lng: -90.735157 },
  { lat: 14.473824, lng: -90.734995 },
  { lat: 14.473500, lng: -90.734714 },
  { lat: 14.473112, lng: -90.734309 },
  { lat: 14.472927, lng: -90.734524 },
  { lat: 14.473071, lng: -90.735145 },
  { lat: 14.473296, lng: -90.735706 },
  { lat: 14.473104, lng: -90.735810 },
  { lat: 14.472475, lng: -90.735956 },
  { lat: 14.472085, lng: -90.736321 },
  { lat: 14.471901, lng: -90.736584 },
  { lat: 14.471713, lng: -90.736855 },
  { lat: 14.471856, lng: -90.737034 },
  { lat: 14.472031, lng: -90.737096 },
  { lat: 14.472045, lng: -90.737264 },
  { lat: 14.472134, lng: -90.737478 },
  { lat: 14.472342, lng: -90.737764 },
  { lat: 14.472486, lng: -90.737993 },
  { lat: 14.472502, lng: -90.738254 },
  { lat: 14.472483, lng: -90.738524 },
  { lat: 14.472431, lng: -90.738762 },
  { lat: 14.472106, lng: -90.738555 },
  { lat: 14.471770, lng: -90.738222 },
  { lat: 14.471338, lng: -90.738148 },
  { lat: 14.471156, lng: -90.738060 },
  { lat: 14.471152, lng: -90.738107 },
  { lat: 14.471258, lng: -90.738304 },
  { lat: 14.471358, lng: -90.738491 },
  { lat: 14.471395, lng: -90.738731 },
  { lat: 14.471377, lng: -90.738910 },
  { lat: 14.471330, lng: -90.739166 },
  { lat: 14.471355, lng: -90.739243 },
  { lat: 14.471421, lng: -90.739402 },
  { lat: 14.471363, lng: -90.739560 },
  { lat: 14.471365, lng: -90.739609 },
  { lat: 14.471302, lng: -90.739982 },
  { lat: 14.471300, lng: -90.740303 },
  { lat: 14.471337, lng: -90.740455 },
  { lat: 14.471530, lng: -90.740704 },
  { lat: 14.471594, lng: -90.740803 },
  { lat: 14.471649, lng: -90.740915 },
  { lat: 14.471689, lng: -90.741067 },
  { lat: 14.471485, lng: -90.740992 },
  { lat: 14.471347, lng: -90.740925 },
  { lat: 14.471170, lng: -90.740832 },
  { lat: 14.470955, lng: -90.740730 },
  { lat: 14.470676, lng: -90.740473 },
  { lat: 14.470541, lng: -90.740372 },
  { lat: 14.470447, lng: -90.740268 },
  { lat: 14.470431, lng: -90.740326 },
  { lat: 14.470404, lng: -90.740560 },
  { lat: 14.470405, lng: -90.740677 },
  { lat: 14.470239, lng: -90.740613 },
  { lat: 14.470082, lng: -90.740450 },
  { lat: 14.470110, lng: -90.740771 },
  { lat: 14.470077, lng: -90.740956 },
  { lat: 14.469910, lng: -90.740836 },
  { lat: 14.469742, lng: -90.740723 },
  { lat: 14.469719, lng: -90.740797 },
  { lat: 14.469719, lng: -90.740827 },
  { lat: 14.469712, lng: -90.741036 },
  { lat: 14.469571, lng: -90.740943 },
  { lat: 14.469498, lng: -90.740871 },
  { lat: 14.469403, lng: -90.740817 },
  { lat: 14.469403, lng: -90.740945 },
  { lat: 14.469305, lng: -90.740947 },
  { lat: 14.469213, lng: -90.740877 },
  { lat: 14.469201, lng: -90.741024 },
  { lat: 14.469125, lng: -90.741066 },
  { lat: 14.469082, lng: -90.741042 },
  { lat: 14.468958, lng: -90.740843 },
  { lat: 14.468845, lng: -90.740712 },
  { lat: 14.468732, lng: -90.740682 },
  { lat: 14.468717, lng: -90.740674 },
  { lat: 14.468443, lng: -90.740358 },
  { lat: 14.468277, lng: -90.740135 },
  { lat: 14.468036, lng: -90.740012 },
  { lat: 14.467902, lng: -90.739917 },
  { lat: 14.467872, lng: -90.739922 },
  { lat: 14.467884, lng: -90.740056 },
  { lat: 14.467822, lng: -90.740061 },
  { lat: 14.467794, lng: -90.740051 },
  { lat: 14.467759, lng: -90.740142 },
  { lat: 14.467712, lng: -90.740082 },
  { lat: 14.467686, lng: -90.740086 },
  { lat: 14.467673, lng: -90.740106 },
  { lat: 14.467667, lng: -90.740137 },
  { lat: 14.467673, lng: -90.740276 },
  { lat: 14.467731, lng: -90.740423 },
  { lat: 14.467757, lng: -90.740488 },
  { lat: 14.467569, lng: -90.740456 },
  { lat: 14.467494, lng: -90.740410 },
  { lat: 14.467366, lng: -90.740272 },
  { lat: 14.467283, lng: -90.740135 },
  { lat: 14.467208, lng: -90.740105 },
  { lat: 14.467191, lng: -90.740151 },
  { lat: 14.467195, lng: -90.740198 },
  { lat: 14.467202, lng: -90.740283 },
  { lat: 14.467298, lng: -90.740483 },
  { lat: 14.467351, lng: -90.740641 },
  { lat: 14.467378, lng: -90.740874 },
  { lat: 14.467336, lng: -90.740986 },
  { lat: 14.467312, lng: -90.741118 },
  { lat: 14.467285, lng: -90.741224 },
  { lat: 14.467273, lng: -90.741298 },
  { lat: 14.467197, lng: -90.741321 },
  { lat: 14.467117, lng: -90.741380 },  // Fin de la traza - CIMA del Volcan de Agua
];

// Lugares de referencia con nombre a lo largo de la ruta (del mismo KMZ).
// Utiles para mostrar como puntos de referencia en los mapas (opcional).
const PUNTOS_REFERENCIA_RUTA = [
  { nombre: 'BIENVENIDO A LA CIMA DEL VOLCÁN DE AGUA', lat: 14.467115, lng: -90.741359 },
  { nombre: 'INICIO DEL ZIG ZAG', lat: 14.471600, lng: -90.741035 },
  { nombre: 'INICIO DE TRAMO MAL PASO. PRECAUCIÓN.', lat: 14.472203, lng: -90.736093 },
  { nombre: 'MIRADOR CANAL 3', lat: 14.476659, lng: -90.726922 },
  { nombre: 'CAPILLA', lat: 14.488624, lng: -90.717014 },
  { nombre: 'INICIO', lat: 14.490476, lng: -90.714806 },
  { nombre: 'FIN TRAMO VEHICULAR', lat: 14.487155, lng: -90.720049 },
];

// Coordenadas del punto de partida real de la traza (cerca de la
// Municipalidad de Santa Maria de Jesus). Se usa para detectar si un
// excursionista efectivamente regreso a este punto al finalizar su recorrido.
const PUEBLO_SANTA_MARIA_DE_JESUS = { lat: 14.502745, lng: -90.714459 };
const RADIO_PUEBLO_METROS = 300;

// Coordenadas reales de la cima (del waypoint "Bienvenido a la cima del
// Volcan de Agua"), usadas para el boton "Llegue a la cima".
const CIMA_VOLCAN_DE_AGUA = { lat: 14.467115, lng: -90.741359 };
const RADIO_CIMA_METROS = 200;

// Datos generales de la ruta (informativos, tipo "ficha" como en Wikiloc).
const INFO_RUTA_VOLCAN_DE_AGUA = {
  nombre: 'Volcán de Agua',
  distanciaKm: 19.06,
  desnivelM: 1763,
  dificultad: 'Muy difícil',
};

// Umbrales configurables. Se pueden mover a variables de entorno mas adelante
// si se necesita ajustarlos sin tocar codigo.
const UMBRAL_DESVIACION_METROS = 150; // mas de esto = se salio de la ruta
const UMBRAL_INACTIVIDAD_MINUTOS = 20; // sin moverse por mas de esto = alerta

const RADIO_TIERRA_METROS = 6371000;

function aRadianes(grados) {
  return (grados * Math.PI) / 180;
}

// Distancia entre dos coordenadas GPS (formula de Haversine), en metros.
function distanciaHaversine(a, b) {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const lat1 = aRadianes(a.lat);
  const lat2 = aRadianes(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * RADIO_TIERRA_METROS * Math.asin(Math.sqrt(h));
}

// Distancia aproximada de un punto al segmento formado por p1-p2.
// Se trabaja en un plano local (valido para distancias cortas como un
// sendero de montana) para no complicar la proyeccion esferica.
function distanciaPuntoASegmento(punto, p1, p2) {
  const metrosPorGradoLat = 111320;
  const metrosPorGradoLng = 111320 * Math.cos(aRadianes(punto.lat));

  const toXY = (p) => ({
    x: (p.lng - p1.lng) * metrosPorGradoLng,
    y: (p.lat - p1.lat) * metrosPorGradoLat,
  });

  const A = toXY(p1); // (0,0)
  const B = toXY(p2);
  const P = toXY(punto);

  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const largoAlCuadrado = dx * dx + dy * dy;

  let t = largoAlCuadrado === 0 ? 0 : ((P.x - A.x) * dx + (P.y - A.y) * dy) / largoAlCuadrado;
  t = Math.max(0, Math.min(1, t));

  const proyeccion = { x: A.x + t * dx, y: A.y + t * dy };
  const dPx = P.x - proyeccion.x;
  const dPy = P.y - proyeccion.y;

  return Math.sqrt(dPx * dPx + dPy * dPy);
}

// Distancia minima de un punto a la ruta completa (al segmento mas cercano).
function distanciaARuta(punto, ruta = RUTA_REFERENCIA_VOLCAN_DE_AGUA) {
  let minima = Infinity;
  for (let i = 0; i < ruta.length - 1; i++) {
    const d = distanciaPuntoASegmento(punto, ruta[i], ruta[i + 1]);
    if (d < minima) minima = d;
  }
  return minima;
}

/**
 * 3.10.1 + 3.10.2 + 3.10.3
 * Analiza una nueva lectura de ubicacion de un excursionista y decide si
 * corresponde generar una alerta, y con que nivel de gravedad.
 *
 * @param {object} excursionista - documento actual del excursionista
 *   (debe incluir ubicacionAnterior con lat/lng/timestamp si existe)
 * @param {object} nuevaUbicacion - { lat, lng, timestamp }
 * @returns {object|null} alerta generada o null si todo esta normal
 */
function analizarUbicacion(excursionista, nuevaUbicacion) {
  const distanciaDesvio = distanciaARuta(nuevaUbicacion);
  const desviado = distanciaDesvio > UMBRAL_DESVIACION_METROS;

  let inactivo = false;
  let minutosInactivo = 0;
  const anterior = excursionista.ubicacionActual;
  if (anterior && anterior.lat != null) {
    const distanciaMovida = distanciaHaversine(anterior, nuevaUbicacion);
    const minutosTranscurridos =
      (nuevaUbicacion.timestamp - anterior.timestamp) / 1000 / 60;

    // Si se movio menos de 15 metros en ese lapso, se considera "sin moverse"
    if (distanciaMovida < 15 && minutosTranscurridos >= UMBRAL_INACTIVIDAD_MINUTOS) {
      inactivo = true;
      minutosInactivo = Math.round(minutosTranscurridos);
    }
  }

  if (!desviado && !inactivo) {
    return null; // recorrido normal, no se genera alerta
  }

  // 3.10.3 Clasificacion automatica del nivel de emergencia.
  let nivel = 'leve';
  let tipo = desviado && inactivo ? 'desviacion_e_inactividad' : desviado ? 'desviacion_ruta' : 'inactividad_prolongada';

  if (desviado && inactivo) {
    nivel = 'grave'; // fuera de ruta Y sin moverse: la combinacion mas riesgosa
  } else if (desviado && distanciaDesvio > UMBRAL_DESVIACION_METROS * 2) {
    nivel = 'grave'; // muy lejos del sendero
  } else if (inactivo && minutosInactivo > UMBRAL_INACTIVIDAD_MINUTOS * 2) {
    nivel = 'moderada';
  } else {
    nivel = 'leve';
  }

  const mensaje = desviado && inactivo
    ? `Excursionista a ${Math.round(distanciaDesvio)} m de la ruta y sin moverse hace ${minutosInactivo} min.`
    : desviado
      ? `Excursionista a ${Math.round(distanciaDesvio)} m de la ruta planificada.`
      : `Sin movimiento detectado hace ${minutosInactivo} min.`;

  return {
    tipo,
    nivel,
    mensaje,
    distanciaDesvioMetros: Math.round(distanciaDesvio),
    minutosInactivo,
    generadaAutomaticamente: true,
    timestamp: nuevaUbicacion.timestamp,
  };
}

// Verifica si una ubicacion esta lo suficientemente cerca de la cima como
// para considerar que el excursionista efectivamente llego.
function estaEnLaCima(ubicacion) {
  return distanciaHaversine(ubicacion, CIMA_VOLCAN_DE_AGUA) <= RADIO_CIMA_METROS;
}

// Verifica si una ubicacion esta lo suficientemente cerca del pueblo como
// para considerar que el excursionista efectivamente regreso.
function regresoAlPueblo(ubicacion) {
  return distanciaHaversine(ubicacion, PUEBLO_SANTA_MARIA_DE_JESUS) <= RADIO_PUEBLO_METROS;
}

module.exports = {
  RUTA_REFERENCIA_VOLCAN_DE_AGUA,
  PUNTOS_REFERENCIA_RUTA,
  PUEBLO_SANTA_MARIA_DE_JESUS,
  CIMA_VOLCAN_DE_AGUA,
  INFO_RUTA_VOLCAN_DE_AGUA,
  distanciaHaversine,
  distanciaARuta,
  analizarUbicacion,
  estaEnLaCima,
  regresoAlPueblo,
  UMBRAL_DESVIACION_METROS,
  UMBRAL_INACTIVIDAD_MINUTOS,
};
