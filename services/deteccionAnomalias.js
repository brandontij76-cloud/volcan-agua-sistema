// services/deteccionAnomalias.js
//
// Este modulo implementa, de forma simplificada, los 3 componentes descritos
// en el capitulo III del proyecto (seccion 3.10):
//   3.10.1 Deteccion de anomalias en rutas (desviacion del camino planificado)
//   3.10.2 Alertas predictivas basadas en patrones de movimiento (inactividad)
//   3.10.3 Clasificacion automatica de niveles de emergencia
//
// No usa un modelo de machine learning entrenado (eso requeriria un dataset
// historico que el proyecto todavia no tiene). En su lugar usa reglas basadas
// en distancia/tiempo, que es exactamente lo que la mayoria de sistemas de
// este tipo hacen en su primera version, y que se puede reemplazar mas
// adelante por un modelo real sin cambiar el resto del sistema (la funcion
// "analizarUbicacion" es el unico punto que habria que tocar).

// Ruta de referencia: puntos aproximados entre Santa Maria de Jesus y la
// cima del Volcan de Agua. AJUSTA estas coordenadas con el trazado real del
// sendero (se pueden capturar caminando la ruta con un GPS y exportando los
// puntos, o tomarlos de una plataforma como Wikiloc/AllTrails).
const RUTA_REFERENCIA_VOLCAN_DE_AGUA = [
  { lat: 14.4708, lng: -90.7275 }, // Parque central, Santa Maria de Jesus (inicio)
  { lat: 14.4693, lng: -90.7291 },
  { lat: 14.4675, lng: -90.7312 },
  { lat: 14.4654, lng: -90.7331 },
  { lat: 14.4630, lng: -90.7355 },
  { lat: 14.4606, lng: -90.7373 },
  { lat: 14.4580, lng: -90.7390 },
  { lat: 14.4552, lng: -90.7401 },
  { lat: 14.4520, lng: -90.7410 },
  { lat: 14.4487, lng: -90.7419 },
  { lat: 14.4460, lng: -90.7425 },
  { lat: 14.4450, lng: -90.7433 }, // Cima del Volcan de Agua (fin)
];

// Coordenadas del punto de partida (pueblo), usadas para detectar si un
// excursionista efectivamente regreso al pueblo al finalizar su recorrido.
const PUEBLO_SANTA_MARIA_DE_JESUS = { lat: 14.4708, lng: -90.7275 };
const RADIO_PUEBLO_METROS = 300;

// Coordenadas de la cima, usadas para el boton "Llegue a la cima".
const CIMA_VOLCAN_DE_AGUA = { lat: 14.4450, lng: -90.7433 };

// Datos generales de la ruta (informativos, tipo "ficha" como en Wikiloc).
// AJUSTA estos valores cuando se cargue el KMZ real de la ruta.
const INFO_RUTA_VOLCAN_DE_AGUA = {
  nombre: 'Volcán de Agua',
  distanciaKm: 22.74,
  desnivelM: 1763,
  dificultad: 'Muy difícil',
};
const RADIO_CIMA_METROS = 200;

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
