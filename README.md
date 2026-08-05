# Sistema de Gestion y Seguridad Turistica — Volcan de Agua

Sistema web para la Municipalidad de Santa Maria de Jesus: registro de
excursionistas, monitoreo GPS en tiempo real (desde el navegador, sin
apps nativas), boton de panico, y un modulo de "IA" basado en reglas que
detecta desviaciones de ruta e inactividad prolongada, generando alertas
clasificadas automaticamente por nivel de gravedad (leve / moderada / grave).

Corresponde al alcance descrito en los capitulos II y III del proyecto:
registro y control de recorridos (2.3.4), monitoreo GPS en tiempo real
(2.3.3), sistemas de alerta y emergencia (2.2.6), y deteccion de
anomalias / alertas predictivas / clasificacion de emergencias (3.10).

## Estructura del proyecto

```
volcan-agua-sistema/
├── server.js                     Servidor Express (punto de entrada)
├── config/firebase.js            Conexion a Firebase Realtime Database
├── routes/
│   ├── excursionistas.js         Registro, ubicacion, listado
│   └── alertas.js                Boton de panico, listado, atender
├── services/deteccionAnomalias.js  Modulo de "IA" (reglas): desvio de ruta,
│                                    inactividad, clasificacion de emergencia
├── public/                       Frontend (Bootstrap + Leaflet)
│   ├── index.html                Landing
│   ├── registro.html             Formulario de registro
│   ├── monitor.html              Pantalla del excursionista (GPS + panico)
│   ├── admin.html                Panel administrativo (Municipalidad)
│   └── js/ , css/
└── .env.example                  Variables de entorno de ejemplo
```

## 1. Requisitos

- Node.js 18 o superior
- Una cuenta de Google para crear el proyecto de Firebase (gratis)

## 2. Crear el proyecto de Firebase (una sola vez)

1. Entra a https://console.firebase.google.com y crea un proyecto nuevo.
2. En el menu lateral, entra a **Realtime Database** > **Crear base de datos**.
   Elige modo de prueba para desarrollo (luego se pueden ajustar las reglas
   de seguridad).
3. Copia la URL que te da (algo como
   `https://tu-proyecto-id-default-rtdb.firebaseio.com`).
4. Ve a **Configuracion del proyecto** (icono de engranaje) >
   **Cuentas de servicio** > **Generar nueva clave privada**. Esto descarga
   un archivo `.json`.
5. De ese `.json` necesitas 3 valores: `project_id`, `client_email` y
   `private_key`.

## 3. Configurar el proyecto localmente

```bash
cd volcan-agua-sistema
npm install
cp .env.example .env
```

Abre `.env` y completa:

```
FIREBASE_PROJECT_ID=el project_id del json
FIREBASE_CLIENT_EMAIL=el client_email del json
FIREBASE_PRIVATE_KEY="el private_key del json, tal cual, entre comillas"
FIREBASE_DATABASE_URL=la URL de tu Realtime Database
ADMIN_PASSWORD=la contrasena que quieras para el panel administrativo
```

**Importante:** `FIREBASE_PRIVATE_KEY` en el `.json` trae saltos de linea
como `\n` dentro del texto. Cópialo exactamente como viene, entre comillas
dobles, sin reformatear.

## 4. Ejecutar el proyecto

```bash
npm start
```

Luego abre en el navegador:

- `http://localhost:3000/index.html` — pagina principal
- `http://localhost:3000/registro.html` — registro de excursionista
- `http://localhost:3000/admin.html` — panel administrativo (usa el
  `ADMIN_PASSWORD` que pusiste en `.env`)

Si el `.env` no esta configurado, el sitio va a cargar igual, pero las
acciones que usan la base de datos (registrar, enviar ubicacion, alertas)
van a devolver un error hasta que completes las credenciales de Firebase.

## 5. Nuevas funciones

- **Botón "Llegué a la cima"**: en `monitor.html`, el excursionista puede confirmar que llegó a la cima. Queda guardado con fecha/hora en `cumbreAlcanzada` y `cumbreFechaHora`.
- **Verificación de retorno al pueblo**: al finalizar el recorrido, el sistema compara la última ubicación GPS conocida contra las coordenadas del pueblo (radio de 300 m) y guarda el resultado en `retornoConfirmado` (true/false/null). El historial completo de ubicaciones se conserva siempre, incluso después de finalizar.
- **Identidad visual propia**: paleta oscura con acentos ámbar/teal, tipografía Space Grotesk + Manrope, tarjetas con glassmorphism. Todo el CSS vive en `public/css/style.css`.

## 6. Cómo probar el flujo completo

1. Abre `registro.html` en tu telefono (o en el navegador con la
   herramienta de desarrollador simulando ubicacion) y registra un
   excursionista.
2. Te va a redirigir a `monitor.html`, donde el navegador va a pedir
   permiso de ubicacion. Acepta el permiso.
3. Cada 30 segundos se envia la ubicacion al servidor. Si el
   excursionista se aleja mas de 150 metros de la ruta de referencia, o
   no se mueve por mas de 20 minutos, se genera una alerta automatica.
4. Abre `admin.html` en otra pestana/dispositivo, entra con la
   contrasena, y ahi se ve el mapa con la ubicacion, la lista de
   excursionistas y las alertas.

## 7. Privacidad: borrado automatico de datos personales

El nombre, telefono y contacto de emergencia de cada excursionista se
eliminan automaticamente de Firebase **3 dias** despues del registro (el
historial de ubicaciones y las alertas asociadas se borran junto con el
resto). Esto lo hace `services/limpiezaDatos.js`, que el servidor ejecuta
solo una vez por hora mientras esta corriendo (`server.js`).

Para cambiar el numero de dias, edita la constante `RETENCION_MAXIMA_DIAS`
al inicio de `services/limpiezaDatos.js`.

**Importante:** la limpieza solo corre mientras el servidor Node esta
activo. Si necesitas que se ejecute aunque el servidor este apagado (por
ejemplo en un hosting con "cron jobs" o "scheduled functions"), esa logica
se puede migrar a una Cloud Function programada de Firebase mas adelante.

## 8. Puntos para seguir desarrollando

- **Ruta de referencia real:** las coordenadas del sendero en
  `services/deteccionAnomalias.js` (`RUTA_REFERENCIA_VOLCAN_DE_AGUA`) son
  aproximadas. Reemplazalas por el trazado real (se puede capturar
  caminando la ruta con un GPS, o exportar desde Wikiloc/AllTrails).
- **Autenticacion del panel administrativo:** ahora mismo es una
  contrasena simple guardada en `.env`. Para produccion, reemplazar por
  Firebase Authentication con usuarios reales.
- **Umbrales de alerta:** `UMBRAL_DESVIACION_METROS` y
  `UMBRAL_INACTIVIDAD_MINUTOS`, en el mismo archivo del servicio de
  deteccion, se pueden ajustar segun las pruebas de campo.
- **Notificaciones reales:** hoy las alertas solo aparecen en el panel
  administrativo. Se puede agregar el envio de SMS (Twilio) o
  notificaciones push cuando se genera una alerta grave.
