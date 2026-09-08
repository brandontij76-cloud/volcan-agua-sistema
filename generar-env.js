// generar-env.js
//
// Este script arma el archivo .env automaticamente, leyendo directamente
// el archivo .json que descargaste de Firebase (Cuentas de servicio).
// Asi se evita cualquier error de copiar y pegar la clave privada a mano.
//
// USO (desde la terminal, dentro de la carpeta del proyecto):
//
//   node generar-env.js "RUTA_DEL_JSON" "URL_DE_TU_DATABASE" "TU_PASSWORD_ADMIN" "TU_GEMINI_API_KEY(opcional)"
//
// Ejemplo (con datos de muestra, reemplaza cada valor por el tuyo):
//
//   node generar-env.js "C:\Users\TuUsuario\Downloads\tu-proyecto-firebase-adminsdk-xxxxx.json" "https://tu-proyecto-default-rtdb.firebaseio.com" "una-contraseña-larga-y-unica"

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [, , rutaJson, databaseUrl, adminPassword, geminiApiKey] = process.argv;

if (!rutaJson) {
  console.error(
    '\nFalta la ruta del archivo .json de Firebase.\n\n' +
    'Uso:\n' +
    '  node generar-env.js "RUTA_DEL_JSON" "URL_DE_TU_DATABASE" "TU_PASSWORD_ADMIN"\n'
  );
  process.exit(1);
}

if (!fs.existsSync(rutaJson)) {
  console.error(`\nNo se encontro el archivo en esta ruta:\n  ${rutaJson}\n`);
  process.exit(1);
}

let credenciales;
try {
  credenciales = JSON.parse(fs.readFileSync(rutaJson, 'utf8'));
} catch (error) {
  console.error('\nEl archivo no es un JSON valido. Revisa que sea el archivo correcto.\n', error.message);
  process.exit(1);
}

if (!credenciales.project_id || !credenciales.client_email || !credenciales.private_key) {
  console.error('\nEl JSON no tiene el formato esperado (falta project_id, client_email o private_key).\n');
  process.exit(1);
}

// El JSON ya trae la clave con saltos de linea reales; aqui se convierten a
// la secuencia de texto "\n" (dos caracteres) que necesita el archivo .env.
const privateKeyEscapada = credenciales.private_key.replace(/\n/g, '\\n');

const urlFinal = databaseUrl || `https://${credenciales.project_id}-default-rtdb.firebaseio.com`;
const passwordFinal = adminPassword || 'cambia-esta-clave';
// Clave para firmar los tokens de sesion del panel administrativo y de
// colaboradores. Se genera al azar cada vez que corres este script -- no
// hace falta que la recuerdes ni la escribas a mano.
const sessionSecretFinal = crypto.randomBytes(32).toString('hex');

const contenidoEnv = `FIREBASE_PROJECT_ID=${credenciales.project_id}
FIREBASE_CLIENT_EMAIL=${credenciales.client_email}
FIREBASE_PRIVATE_KEY="${privateKeyEscapada}"
FIREBASE_DATABASE_URL=${urlFinal}
PORT=3000
ADMIN_PASSWORD=${passwordFinal}
SESSION_SECRET=${sessionSecretFinal}
CORS_ORIGIN=http://localhost:3000
GEMINI_API_KEY=${geminiApiKey || ''}
GEMINI_MODEL=gemini-flash-latest
`;

fs.writeFileSync(path.join(__dirname, '.env'), contenidoEnv, 'utf8');

console.log('\n.env generado correctamente con estos valores:');
console.log(`  FIREBASE_PROJECT_ID   = ${credenciales.project_id}`);
console.log(`  FIREBASE_CLIENT_EMAIL = ${credenciales.client_email}`);
console.log(`  FIREBASE_DATABASE_URL = ${urlFinal}`);
console.log(`  ADMIN_PASSWORD        = ${passwordFinal}`);
console.log('  SESSION_SECRET        = (generado al azar, no hace falta anotarlo)');
if (!databaseUrl) {
  console.log('\n[AVISO] No pasaste la URL de la base de datos, se genero una por defecto.');
  console.log('  Verifica en Firebase Console > Realtime Database que coincida con la real.');
}
if (!adminPassword) {
  console.log('\n[AVISO] No pasaste una contrasena de administrador, se puso una temporal.');
  console.log('  Edita ADMIN_PASSWORD en el archivo .env antes de usar el panel.');
}
if (!geminiApiKey) {
  console.log('\n[INFO] No pasaste una llave de Gemini. El asistente va a funcionar');
  console.log('  igual, solo sin el texto en lenguaje natural generado por IA.');
  console.log('  La puedes agregar despues editando GEMINI_API_KEY en el .env.');
}
console.log('\n[IMPORTANTE] Cuando despliegues en Render (u otro hosting), edita ahi');
console.log('  la variable CORS_ORIGIN con la URL real de tu sitio (por ejemplo');
console.log('  https://volcan-agua-sistema.onrender.com), para que solo tu propio');
console.log('  sitio pueda usar la API.');
console.log('');
