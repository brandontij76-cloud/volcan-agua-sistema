// generar-env.js
//
// Este script arma el archivo .env automaticamente, leyendo directamente
// el archivo .json que descargaste de Firebase (Cuentas de servicio).
// Asi se evita cualquier error de copiar y pegar la clave privada a mano.
//
// USO (desde la terminal, dentro de la carpeta del proyecto):
//
//   node generar-env.js "RUTA_DEL_JSON" "URL_DE_TU_DATABASE" "TU_PASSWORD_ADMIN"
//
// Ejemplo real (ajusta la ruta y el password a los tuyos):
//
//   node generar-env.js "C:\Users\Dell\Downloads\volcan-agua-sistema-firebase-adminsdk-fbsvc-49a5833856.json" "https://volcan-agua-sistema-default-rtdb.firebaseio.com" "Alexander5610*"

const fs = require('fs');
const path = require('path');

const [, , rutaJson, databaseUrl, adminPassword] = process.argv;

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

const contenidoEnv = `FIREBASE_PROJECT_ID=${credenciales.project_id}
FIREBASE_CLIENT_EMAIL=${credenciales.client_email}
FIREBASE_PRIVATE_KEY="${privateKeyEscapada}"
FIREBASE_DATABASE_URL=${urlFinal}
PORT=3000
ADMIN_PASSWORD=${passwordFinal}
`;

fs.writeFileSync(path.join(__dirname, '.env'), contenidoEnv, 'utf8');

console.log('\n.env generado correctamente con estos valores:');
console.log(`  FIREBASE_PROJECT_ID   = ${credenciales.project_id}`);
console.log(`  FIREBASE_CLIENT_EMAIL = ${credenciales.client_email}`);
console.log(`  FIREBASE_DATABASE_URL = ${urlFinal}`);
console.log(`  ADMIN_PASSWORD        = ${passwordFinal}`);
if (!databaseUrl) {
  console.log('\n[AVISO] No pasaste la URL de la base de datos, se genero una por defecto.');
  console.log('  Verifica en Firebase Console > Realtime Database que coincida con la real.');
}
if (!adminPassword) {
  console.log('\n[AVISO] No pasaste una contrasena de administrador, se puso una temporal.');
  console.log('  Edita ADMIN_PASSWORD en el archivo .env antes de usar el panel.');
}
console.log('');
