// config/firebase.js
// Conexion al proyecto de Firebase (Realtime Database) usando firebase-admin.
// Los datos vienen del archivo .env (ver .env.example).

const admin = require('firebase-admin');
require('dotenv').config();

const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const credencialesCompletas = Boolean(
  process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey
);

let db = null;

if (!credencialesCompletas) {
  console.warn(
    '\n[AVISO] No se encontraron credenciales de Firebase en el archivo .env.\n' +
    'El servidor va a iniciar y las paginas se veran con normalidad, pero las rutas\n' +
    'que usan la base de datos (registro, ubicacion, alertas) van a responder con error\n' +
    'hasta que completes FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY\n' +
    'y FIREBASE_DATABASE_URL en el archivo .env (revisa .env.example).\n'
  );
} else if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

if (credencialesCompletas) {
  db = admin.database();
} else {
  // "db" de mentira: cualquier intento de usarla lanza un error claro y
  // controlado (los routes ya tienen try/catch y responden 500/JSON),
  // en lugar de tumbar el proceso de Node al arrancar.
  const errorConfiguracion = () => {
    throw new Error(
      'Firebase no esta configurado todavia. Completa el archivo .env (ver .env.example).'
    );
  };
  db = new Proxy(
    {},
    {
      get() {
        errorConfiguracion();
      },
    }
  );
}

module.exports = { admin, db, firebaseConfigurado: credencialesCompletas };
