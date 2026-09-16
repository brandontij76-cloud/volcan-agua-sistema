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
// registrada con GPS.
//
// La ruta, los puntos de referencia, la cima, el pueblo y los umbrales de
// desviacion/inactividad YA NO estan fijos aqui: se leen del nodo
// configuracion_ruta y parametros_sistema de Firebase (con cache en
// memoria), a traves de services/configuracionSistema.js. Esto permite
// ajustar cualquiera de esos valores desde el panel administrativo, sin
// tener que modificar el codigo ni volver a desplegar el servidor.

const {
  obtenerConfiguracionRuta,
  obtenerParametrosSistema,
} = require('./configuracionSistema');

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

// Proyecta un punto sobre el segmento formado por p1-p2 y devuelve tanto la
// distancia perpendicular (en metros) como "t" (0 a 1: que tan avanzado esta
// el punto proyectado dentro del segmento). Se trabaja en un plano local
// (valido para distancias cortas como un sendero de montana) para no
// complicar la proyeccion esferica.
function proyectarPuntoEnSegmento(punto, p1, p2) {
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

  return { distancia: Math.sqrt(dPx * dPx + dPy * dPy), t };
}

// Distancia aproximada de un punto al segmento formado por p1-p2, en metros.
function distanciaPuntoASegmento(punto, p1, p2) {
  return proyectarPuntoEnSegmento(punto, p1, p2).distancia;
}

// Distancia minima de un punto a la ruta completa (al segmento mas cercano).
function distanciaARuta(punto, ruta = obtenerConfiguracionRuta().rutaReferencia) {
  let minima = Infinity;
  for (let i = 0; i < ruta.length - 1; i++) {
    const d = distanciaPuntoASegmento(punto, ruta[i], ruta[i + 1]);
    if (d < minima) minima = d;
  }
  return minima;
}

// Progreso a lo largo de la ruta: encuentra el segmento mas cercano al punto
// dado y devuelve la distancia acumulada (en km) desde el inicio de la traza
// hasta la proyeccion del punto en ese segmento. Sirve para mostrarle al
// excursionista (y al panel administrativo) cuantos kilometros lleva
// recorridos, sin necesitar GPS de alta precision constante.
function progresoEnRutaKm(punto, ruta = obtenerConfiguracionRuta().rutaReferencia) {
  let mejorDistancia = Infinity;
  let mejorProgresoMetros = 0;
  let acumuladoMetros = 0;

  for (let i = 0; i < ruta.length - 1; i++) {
    const p1 = ruta[i];
    const p2 = ruta[i + 1];
    const largoSegmento = distanciaHaversine(p1, p2);
    const { distancia, t } = proyectarPuntoEnSegmento(punto, p1, p2);

    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejorProgresoMetros = acumuladoMetros + t * largoSegmento;
    }
    acumuladoMetros += largoSegmento;
  }

  return Math.round((mejorProgresoMetros / 1000) * 10) / 10; // km, 1 decimal
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
  const { umbralDesviacionMetros, umbralInactividadMinutos } = obtenerParametrosSistema();

  const distanciaDesvio = distanciaARuta(nuevaUbicacion);
  const desviado = distanciaDesvio > umbralDesviacionMetros;

  let inactivo = false;
  let minutosInactivo = 0;
  const anterior = excursionista.ubicacionActual;
  if (anterior && anterior.lat != null) {
    const distanciaMovida = distanciaHaversine(anterior, nuevaUbicacion);
    const minutosTranscurridos =
      (nuevaUbicacion.timestamp - anterior.timestamp) / 1000 / 60;

    // Si se movio menos de 15 metros en ese lapso, se considera "sin moverse"
    if (distanciaMovida < 15 && minutosTranscurridos >= umbralInactividadMinutos) {
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
  } else if (desviado && distanciaDesvio > umbralDesviacionMetros * 2) {
    nivel = 'grave'; // muy lejos del sendero
  } else if (inactivo && minutosInactivo > umbralInactividadMinutos * 2) {
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
  const { coordenadasCima, radioCimaMetros } = obtenerConfiguracionRuta();
  return distanciaHaversine(ubicacion, coordenadasCima) <= radioCimaMetros;
}

// Verifica si una ubicacion esta lo suficientemente cerca del pueblo como
// para considerar que el excursionista efectivamente regreso.
function regresoAlPueblo(ubicacion) {
  const { coordenadasRetorno, radioRetornoMetros } = obtenerConfiguracionRuta();
  return distanciaHaversine(ubicacion, coordenadasRetorno) <= radioRetornoMetros;
}

module.exports = {
  distanciaHaversine,
  distanciaARuta,
  progresoEnRutaKm,
  analizarUbicacion,
  estaEnLaCima,
  regresoAlPueblo,
};
