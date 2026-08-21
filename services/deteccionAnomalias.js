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
// RUTA REAL DEL VOLCAN DE AGUA
// Extraida de un archivo KMZ real (GPS grabado y publicado en Wikiloc:
// https://www.wikiloc.com/hiking-trails/volcan-de-agua-15819168), cerca de
// Santa Maria de Jesus, Sacatepequez. Se simplifico de 2080 puntos GPS
// originales a 175 puntos representativos (cada ~12mo punto, mas el inicio,
// la cima exacta, y el final), conservando la forma real del sendero.
//
// Datos oficiales de la traza (Wikiloc): distancia 22.74 km, desnivel
// positivo 1763 m, tipo "One way" (recorrido de ida, no un circuito cerrado).
// ---------------------------------------------------------------------
const RUTA_REFERENCIA_VOLCAN_DE_AGUA = [
  { lat: 14.499989, lng: -90.711909 },  // Inicio de la traza GPS real (Wikiloc, ~2000 m)
  { lat: 14.498854, lng: -90.711653 },
  { lat: 14.497910, lng: -90.712142 },
  { lat: 14.497647, lng: -90.713283 },
  { lat: 14.497494, lng: -90.714449 },
  { lat: 14.496976, lng: -90.715432 },
  { lat: 14.496093, lng: -90.716117 },
  { lat: 14.495178, lng: -90.716850 },
  { lat: 14.494675, lng: -90.717866 },
  { lat: 14.494371, lng: -90.718942 },
  { lat: 14.493332, lng: -90.719165 },
  { lat: 14.492347, lng: -90.718567 },
  { lat: 14.491386, lng: -90.717928 },
  { lat: 14.490299, lng: -90.717632 },
  { lat: 14.489222, lng: -90.717283 },
  { lat: 14.488423, lng: -90.717537 },
  { lat: 14.487982, lng: -90.718571 },
  { lat: 14.487382, lng: -90.719531 },
  { lat: 14.486701, lng: -90.720443 },
  { lat: 14.485869, lng: -90.721105 },
  { lat: 14.484988, lng: -90.721750 },
  { lat: 14.483951, lng: -90.722141 },
  { lat: 14.483096, lng: -90.722206 },
  { lat: 14.482349, lng: -90.723028 },
  { lat: 14.481820, lng: -90.723426 },
  { lat: 14.481988, lng: -90.724319 },
  { lat: 14.481211, lng: -90.724475 },
  { lat: 14.480901, lng: -90.724887 },
  { lat: 14.480640, lng: -90.725393 },
  { lat: 14.479575, lng: -90.725072 },
  { lat: 14.479834, lng: -90.725893 },
  { lat: 14.478872, lng: -90.726069 },
  { lat: 14.477904, lng: -90.725754 },
  { lat: 14.477736, lng: -90.725661 },
  { lat: 14.478735, lng: -90.726089 },
  { lat: 14.477959, lng: -90.725782 },
  { lat: 14.476986, lng: -90.725560 },
  { lat: 14.477387, lng: -90.726277 },
  { lat: 14.478124, lng: -90.727123 },
  { lat: 14.477391, lng: -90.727218 },
  { lat: 14.476396, lng: -90.727068 },
  { lat: 14.476397, lng: -90.728058 },
  { lat: 14.476975, lng: -90.728959 },
  { lat: 14.477483, lng: -90.729735 },
  { lat: 14.477373, lng: -90.730722 },
  { lat: 14.477364, lng: -90.731829 },
  { lat: 14.477360, lng: -90.732822 },
  { lat: 14.476719, lng: -90.732273 },
  { lat: 14.475860, lng: -90.731590 },
  { lat: 14.475023, lng: -90.731178 },
  { lat: 14.474093, lng: -90.731358 },
  { lat: 14.474880, lng: -90.732159 },
  { lat: 14.474912, lng: -90.733124 },
  { lat: 14.474910, lng: -90.734245 },
  { lat: 14.475246, lng: -90.734874 },
  { lat: 14.474295, lng: -90.734391 },
  { lat: 14.474006, lng: -90.734666 },
  { lat: 14.473582, lng: -90.734801 },
  { lat: 14.472859, lng: -90.734413 },
  { lat: 14.473206, lng: -90.735484 },
  { lat: 14.472901, lng: -90.735870 },
  { lat: 14.472005, lng: -90.736402 },
  { lat: 14.471968, lng: -90.737034 },
  { lat: 14.472492, lng: -90.738022 },
  { lat: 14.472172, lng: -90.738640 },
  { lat: 14.471248, lng: -90.738078 },
  { lat: 14.471365, lng: -90.738817 },
  { lat: 14.471332, lng: -90.739918 },
  { lat: 14.471676, lng: -90.740921 },
  { lat: 14.470887, lng: -90.740669 },
  { lat: 14.470401, lng: -90.740614 },
  { lat: 14.470095, lng: -90.740994 },
  { lat: 14.469525, lng: -90.740898 },
  { lat: 14.469071, lng: -90.740997 },
  { lat: 14.468379, lng: -90.740206 },
  { lat: 14.467709, lng: -90.740070 },
  { lat: 14.467286, lng: -90.740192 },
  { lat: 14.467292, lng: -90.741007 },
  { lat: 14.466951, lng: -90.742042 },
  { lat: 14.466512, lng: -90.742935 },  // CIMA real - punto mas alto de la traza (3746 m)
  { lat: 14.465564, lng: -90.742958 },
  { lat: 14.465014, lng: -90.742123 },
  { lat: 14.465379, lng: -90.741107 },
  { lat: 14.466304, lng: -90.740577 },
  { lat: 14.467115, lng: -90.741193 },
  { lat: 14.467346, lng: -90.740620 },
  { lat: 14.467564, lng: -90.740440 },
  { lat: 14.467897, lng: -90.739903 },
  { lat: 14.468674, lng: -90.740623 },
  { lat: 14.469376, lng: -90.740991 },
  { lat: 14.469965, lng: -90.740877 },
  { lat: 14.470442, lng: -90.740439 },
  { lat: 14.471057, lng: -90.740757 },
  { lat: 14.471467, lng: -90.740680 },
  { lat: 14.471377, lng: -90.739588 },
  { lat: 14.471353, lng: -90.738511 },
  { lat: 14.471610, lng: -90.738174 },
  { lat: 14.472496, lng: -90.738712 },
  { lat: 14.472247, lng: -90.737716 },
  { lat: 14.471779, lng: -90.737069 },
  { lat: 14.472224, lng: -90.736194 },
  { lat: 14.473224, lng: -90.735718 },
  { lat: 14.473056, lng: -90.734954 },
  { lat: 14.473296, lng: -90.734471 },
  { lat: 14.474104, lng: -90.735192 },
  { lat: 14.473984, lng: -90.734114 },
  { lat: 14.474925, lng: -90.734746 },
  { lat: 14.475128, lng: -90.734443 },
  { lat: 14.474816, lng: -90.733391 },
  { lat: 14.475053, lng: -90.732343 },
  { lat: 14.474260, lng: -90.731534 },
  { lat: 14.474829, lng: -90.731197 },
  { lat: 14.475822, lng: -90.731466 },
  { lat: 14.476615, lng: -90.732174 },
  { lat: 14.477343, lng: -90.732771 },
  { lat: 14.477469, lng: -90.731831 },
  { lat: 14.477430, lng: -90.730731 },
  { lat: 14.477579, lng: -90.729825 },
  { lat: 14.477158, lng: -90.728905 },
  { lat: 14.476472, lng: -90.728033 },
  { lat: 14.476426, lng: -90.727035 },
  { lat: 14.477414, lng: -90.727209 },
  { lat: 14.478203, lng: -90.727185 },
  { lat: 14.477457, lng: -90.726337 },
  { lat: 14.477003, lng: -90.725528 },
  { lat: 14.478005, lng: -90.725753 },
  { lat: 14.479044, lng: -90.726011 },
  { lat: 14.479759, lng: -90.725704 },
  { lat: 14.479868, lng: -90.725075 },
  { lat: 14.480904, lng: -90.725436 },
  { lat: 14.481176, lng: -90.724703 },
  { lat: 14.481866, lng: -90.724446 },
  { lat: 14.481872, lng: -90.723554 },
  { lat: 14.482320, lng: -90.722996 },
  { lat: 14.483115, lng: -90.722213 },
  { lat: 14.483920, lng: -90.722126 },
  { lat: 14.484982, lng: -90.721759 },
  { lat: 14.485911, lng: -90.721138 },
  { lat: 14.486783, lng: -90.720425 },
  { lat: 14.487462, lng: -90.719530 },
  { lat: 14.488004, lng: -90.718569 },
  { lat: 14.488427, lng: -90.717517 },
  { lat: 14.488907, lng: -90.716542 },
  { lat: 14.489563, lng: -90.715624 },
  { lat: 14.490416, lng: -90.714912 },
  { lat: 14.491236, lng: -90.714089 },
  { lat: 14.492034, lng: -90.713252 },
  { lat: 14.492952, lng: -90.712557 },
  { lat: 14.493921, lng: -90.711941 },
  { lat: 14.494549, lng: -90.711108 },
  { lat: 14.495024, lng: -90.710053 },
  { lat: 14.496053, lng: -90.710407 },
  { lat: 14.496823, lng: -90.710471 },
  { lat: 14.497673, lng: -90.710391 },
  { lat: 14.498789, lng: -90.710636 },
  { lat: 14.499914, lng: -90.709899 },
  { lat: 14.501265, lng: -90.709806 },
  { lat: 14.502314, lng: -90.710694 },
  { lat: 14.502494, lng: -90.712339 },
  { lat: 14.502505, lng: -90.714107 },
  { lat: 14.503662, lng: -90.714652 },
  { lat: 14.505309, lng: -90.714595 },
  { lat: 14.506429, lng: -90.715514 },
  { lat: 14.507276, lng: -90.716957 },
  { lat: 14.508489, lng: -90.717934 },
  { lat: 14.509274, lng: -90.719032 },
  { lat: 14.510183, lng: -90.720236 },
  { lat: 14.510824, lng: -90.721276 },
  { lat: 14.511069, lng: -90.722539 },
  { lat: 14.511281, lng: -90.723648 },
  { lat: 14.511617, lng: -90.722208 },
  { lat: 14.511842, lng: -90.720865 },
  { lat: 14.511836, lng: -90.719699 },
  { lat: 14.512468, lng: -90.721073 },
  { lat: 14.512669, lng: -90.721575 },  // Fin de la traza GPS real (Wikiloc, ~1760 m)
];

// Coordenadas del punto de partida real de la traza GPS (donde inicia el
// sendero registrado). Se usa para detectar si un excursionista efectivamente
// regreso a este punto al finalizar su recorrido.
const PUEBLO_SANTA_MARIA_DE_JESUS = { lat: 14.499989, lng: -90.711909 };
const RADIO_PUEBLO_METROS = 300;

// Coordenadas reales de la cima (el punto de mayor altitud registrado en el
// GPS: 3746 m), usadas para el boton "Llegue a la cima".
const CIMA_VOLCAN_DE_AGUA = { lat: 14.466512, lng: -90.742935 };
const RADIO_CIMA_METROS = 200;

// Datos generales de la ruta (informativos, tipo "ficha" como en Wikiloc).
// Calculados a partir de la traza GPS real: la distancia (22.74 km) coincide
// exacto con la publicada en Wikiloc; el desnivel se calculo aplicando un
// suavizado de ruido GPS (ventana movil de 21 puntos), dando 1765 m, muy
// cercano a los 1763 m oficiales publicados.
const INFO_RUTA_VOLCAN_DE_AGUA = {
  nombre: 'Volcán de Agua',
  distanciaKm: 22.74,
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
