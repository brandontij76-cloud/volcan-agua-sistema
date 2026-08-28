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
// RUTA REAL DEL VOLCAN DE AGUA (version oficial/municipal, actualizada)
// Extraida del archivo KMZ mas reciente proporcionado por la Municipalidad,
// con puntos de referencia reales a lo largo del camino (Capilla, Fin de
// tramo vehicular, Mirador Canal 3, Inicio del zig zag, y la Cima).
// Se simplifico de 425 puntos GPS originales a 213 (cada 2do punto),
// conservando la forma real del sendero.
//
// Distancia de ida calculada: 9.54 km (~19.08 km ida y vuelta).
// El desnivel (1763 m) se mantiene del dato oficial previamente conocido,
// ya que este KMZ no incluye informacion de altitud.
// ---------------------------------------------------------------------
const RUTA_REFERENCIA_VOLCAN_DE_AGUA = [
  { lat: 14.502745, lng: -90.714459 },  // Inicio de la traza (cerca de la Municipalidad)
  { lat: 14.502411, lng: -90.710954 },
  { lat: 14.501582, lng: -90.709701 },
  { lat: 14.499197, lng: -90.71025 },
  { lat: 14.498679, lng: -90.710702 },
  { lat: 14.497348, lng: -90.710232 },
  { lat: 14.49674, lng: -90.710621 },
  { lat: 14.494494, lng: -90.709653 },
  { lat: 14.494217, lng: -90.710359 },
  { lat: 14.494499, lng: -90.71121 },
  { lat: 14.493476, lng: -90.71223 },
  { lat: 14.492282, lng: -90.712937 },
  { lat: 14.491373, lng: -90.713916 },
  { lat: 14.489424, lng: -90.715738 },
  { lat: 14.488331, lng: -90.717699 },
  { lat: 14.487872, lng: -90.718829 },
  { lat: 14.486994, lng: -90.720193 },
  { lat: 14.486069, lng: -90.72105 },
  { lat: 14.485493, lng: -90.721483 },
  { lat: 14.484562, lng: -90.721853 },
  { lat: 14.483495, lng: -90.722249 },
  { lat: 14.483233, lng: -90.722221 },
  { lat: 14.482969, lng: -90.722413 },
  { lat: 14.482715, lng: -90.72266 },
  { lat: 14.482294, lng: -90.723006 },
  { lat: 14.482115, lng: -90.723176 },
  { lat: 14.481857, lng: -90.72318 },
  { lat: 14.481874, lng: -90.723613 },
  { lat: 14.482042, lng: -90.724159 },
  { lat: 14.481884, lng: -90.724377 },
  { lat: 14.481853, lng: -90.724604 },
  { lat: 14.481408, lng: -90.724667 },
  { lat: 14.481174, lng: -90.724534 },
  { lat: 14.481121, lng: -90.724651 },
  { lat: 14.480944, lng: -90.724955 },
  { lat: 14.481011, lng: -90.725228 },
  { lat: 14.481001, lng: -90.725484 },
  { lat: 14.480673, lng: -90.725419 },
  { lat: 14.480014, lng: -90.725125 },
  { lat: 14.479496, lng: -90.725122 },
  { lat: 14.479421, lng: -90.725287 },
  { lat: 14.479615, lng: -90.725555 },
  { lat: 14.47978, lng: -90.72585 },
  { lat: 14.479554, lng: -90.725964 },
  { lat: 14.478654, lng: -90.726069 },
  { lat: 14.478059, lng: -90.725764 },
  { lat: 14.477592, lng: -90.725522 },
  { lat: 14.477305, lng: -90.725513 },
  { lat: 14.47692, lng: -90.725555 },
  { lat: 14.476846, lng: -90.72572 },
  { lat: 14.477024, lng: -90.725969 },
  { lat: 14.477312, lng: -90.7262 },
  { lat: 14.477565, lng: -90.726589 },
  { lat: 14.47805, lng: -90.726994 },
  { lat: 14.478177, lng: -90.727402 },
  { lat: 14.477923, lng: -90.727416 },
  { lat: 14.477678, lng: -90.727315 },
  { lat: 14.477403, lng: -90.727184 },
  { lat: 14.477039, lng: -90.726965 },
  { lat: 14.476501, lng: -90.726966 },
  { lat: 14.476294, lng: -90.727193 },
  { lat: 14.476245, lng: -90.727583 },
  { lat: 14.476357, lng: -90.728021 },
  { lat: 14.476756, lng: -90.728367 },
  { lat: 14.476865, lng: -90.728661 },
  { lat: 14.477116, lng: -90.728897 },
  { lat: 14.477357, lng: -90.729065 },
  { lat: 14.477464, lng: -90.729315 },
  { lat: 14.477608, lng: -90.729629 },
  { lat: 14.477412, lng: -90.730085 },
  { lat: 14.477201, lng: -90.730382 },
  { lat: 14.477439, lng: -90.730787 },
  { lat: 14.477485, lng: -90.731212 },
  { lat: 14.47745, lng: -90.731612 },
  { lat: 14.477484, lng: -90.731998 },
  { lat: 14.477627, lng: -90.732384 },
  { lat: 14.477459, lng: -90.732712 },
  { lat: 14.477309, lng: -90.732886 },
  { lat: 14.477241, lng: -90.732593 },
  { lat: 14.477057, lng: -90.732502 },
  { lat: 14.476796, lng: -90.7324 },
  { lat: 14.4766, lng: -90.732208 },
  { lat: 14.476372, lng: -90.731944 },
  { lat: 14.476152, lng: -90.731748 },
  { lat: 14.475738, lng: -90.73136 },
  { lat: 14.475094, lng: -90.731127 },
  { lat: 14.474636, lng: -90.731139 },
  { lat: 14.474293, lng: -90.73112 },
  { lat: 14.474133, lng: -90.731354 },
  { lat: 14.474374, lng: -90.731639 },
  { lat: 14.474563, lng: -90.731798 },
  { lat: 14.475018, lng: -90.732292 },
  { lat: 14.475011, lng: -90.73276 },
  { lat: 14.474833, lng: -90.733269 },
  { lat: 14.47482, lng: -90.733818 },
  { lat: 14.474965, lng: -90.734323 },
  { lat: 14.475183, lng: -90.734499 },
  { lat: 14.475236, lng: -90.734811 },
  { lat: 14.475308, lng: -90.734967 },
  { lat: 14.474941, lng: -90.734725 },
  { lat: 14.474609, lng: -90.734629 },
  { lat: 14.474283, lng: -90.734412 },
  { lat: 14.474053, lng: -90.734105 },
  { lat: 14.473974, lng: -90.734203 },
  { lat: 14.474004, lng: -90.734549 },
  { lat: 14.474056, lng: -90.734801 },
  { lat: 14.474103, lng: -90.735114 },
  { lat: 14.473963, lng: -90.735106 },
  { lat: 14.473653, lng: -90.734859 },
  { lat: 14.473295, lng: -90.734468 },
  { lat: 14.472845, lng: -90.73428 },
  { lat: 14.47299, lng: -90.734817 },
  { lat: 14.473209, lng: -90.735406 },
  { lat: 14.473366, lng: -90.735792 },
  { lat: 14.472841, lng: -90.735813 },
  { lat: 14.472321, lng: -90.736138 },
  { lat: 14.471979, lng: -90.736544 },
  { lat: 14.471821, lng: -90.736751 },
  { lat: 14.471772, lng: -90.736969 },
  { lat: 14.471945, lng: -90.737028 },
  { lat: 14.472036, lng: -90.73716 },
  { lat: 14.472061, lng: -90.737352 },
  { lat: 14.472234, lng: -90.737629 },
  { lat: 14.47244, lng: -90.737888 },
  { lat: 14.472498, lng: -90.738154 },
  { lat: 14.472478, lng: -90.738345 },
  { lat: 14.472493, lng: -90.738732 },
  { lat: 14.472298, lng: -90.738751 },
  { lat: 14.471922, lng: -90.738378 },
  { lat: 14.471489, lng: -90.738156 },
  { lat: 14.47116, lng: -90.738063 },
  { lat: 14.471078, lng: -90.738014 },
  { lat: 14.47121, lng: -90.738219 },
  { lat: 14.471353, lng: -90.738481 },
  { lat: 14.471389, lng: -90.738591 },
  { lat: 14.471378, lng: -90.73889 },
  { lat: 14.471318, lng: -90.739082 },
  { lat: 14.471331, lng: -90.739182 },
  { lat: 14.471403, lng: -90.739326 },
  { lat: 14.471362, lng: -90.739546 },
  { lat: 14.471364, lng: -90.739584 },
  { lat: 14.471321, lng: -90.739704 },
  { lat: 14.47126, lng: -90.740153 },
  { lat: 14.471301, lng: -90.740312 },
  { lat: 14.471399, lng: -90.740587 },
  { lat: 14.471534, lng: -90.740713 },
  { lat: 14.471648, lng: -90.740893 },
  { lat: 14.471655, lng: -90.740927 },
  { lat: 14.471623, lng: -90.741063 },
  { lat: 14.471356, lng: -90.740928 },
  { lat: 14.471332, lng: -90.740924 },
  { lat: 14.470961, lng: -90.74073 },
  { lat: 14.470834, lng: -90.740648 },
  { lat: 14.470665, lng: -90.74047 },
  { lat: 14.470536, lng: -90.740369 },
  { lat: 14.470429, lng: -90.740222 },
  { lat: 14.470424, lng: -90.740396 },
  { lat: 14.4704, lng: -90.740566 },
  { lat: 14.470424, lng: -90.740719 },
  { lat: 14.470124, lng: -90.740524 },
  { lat: 14.47008, lng: -90.740579 },
  { lat: 14.470102, lng: -90.740915 },
  { lat: 14.47001, lng: -90.740912 },
  { lat: 14.469792, lng: -90.74074 },
  { lat: 14.469738, lng: -90.740723 },
  { lat: 14.469719, lng: -90.740815 },
  { lat: 14.46972, lng: -90.740954 },
  { lat: 14.469619, lng: -90.741013 },
  { lat: 14.469561, lng: -90.740939 },
  { lat: 14.469445, lng: -90.740827 },
  { lat: 14.469404, lng: -90.740898 },
  { lat: 14.469385, lng: -90.740995 },
  { lat: 14.469282, lng: -90.740925 },
  { lat: 14.469211, lng: -90.740939 },
  { lat: 14.469191, lng: -90.741076 },
  { lat: 14.469122, lng: -90.741065 },
  { lat: 14.469016, lng: -90.740943 },
  { lat: 14.468919, lng: -90.740759 },
  { lat: 14.468747, lng: -90.740684 },
  { lat: 14.468724, lng: -90.740676 },
  { lat: 14.468544, lng: -90.74055 },
  { lat: 14.468453, lng: -90.74023 },
  { lat: 14.468141, lng: -90.740069 },
  { lat: 14.467966, lng: -90.739963 },
  { lat: 14.467876, lng: -90.739856 },
  { lat: 14.46788, lng: -90.740001 },
  { lat: 14.467863, lng: -90.740076 },
  { lat: 14.467816, lng: -90.74006 },
  { lat: 14.467775, lng: -90.74008 },
  { lat: 14.467736, lng: -90.74009 },
  { lat: 14.467709, lng: -90.740082 },
  { lat: 14.467679, lng: -90.740097 },
  { lat: 14.467673, lng: -90.740111 },
  { lat: 14.467668, lng: -90.740189 },
  { lat: 14.467709, lng: -90.740369 },
  { lat: 14.467757, lng: -90.740453 },
  { lat: 14.467687, lng: -90.740509 },
  { lat: 14.467563, lng: -90.740454 },
  { lat: 14.467391, lng: -90.740315 },
  { lat: 14.467321, lng: -90.740195 },
  { lat: 14.467237, lng: -90.7401 },
  { lat: 14.467192, lng: -90.740116 },
  { lat: 14.467194, lng: -90.740191 },
  { lat: 14.467201, lng: -90.740272 },
  { lat: 14.467236, lng: -90.740357 },
  { lat: 14.4673, lng: -90.740487 },
  { lat: 14.467379, lng: -90.740787 },
  { lat: 14.467377, lng: -90.740888 },
  { lat: 14.467315, lng: -90.741026 },
  { lat: 14.467284, lng: -90.741213 },
  { lat: 14.467285, lng: -90.741233 },
  { lat: 14.467241, lng: -90.741324 },
  { lat: 14.467117, lng: -90.74138 },  // Fin de la traza - CIMA del Volcan de Agua
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
  { nombre: 'MUNICIPALIDAD SANTA MARIA DE JESUS', lat: 14.494093, lng: -90.710096 },
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
