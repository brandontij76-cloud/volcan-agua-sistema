// public/js/registro.js
// Envia el formulario de registro al backend y, si todo sale bien,
// redirige al excursionista a la pantalla de monitoreo con su id.

document.getElementById('formRegistro').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const btn = document.getElementById('btnRegistrar');
  const mensajeError = document.getElementById('mensajeError');
  mensajeError.classList.add('d-none');

  const datos = {
    nombre: document.getElementById('nombre').value.trim(),
    telefono: document.getElementById('telefono').value.trim(),
    dpi: document.getElementById('dpi').value.trim(),
    personasGrupo: parseInt(document.getElementById('personasGrupo').value, 10) || 1,
    horaSalidaEstimada: document.getElementById('horaSalida').value,
    contactoEmergenciaNombre: document.getElementById('contactoNombre').value.trim(),
    contactoEmergenciaTelefono: document.getElementById('contactoTelefono').value.trim(),
  };

  btn.disabled = true;
  btn.textContent = 'Registrando...';

  try {
    const respuesta = await fetch('/api/excursionistas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(resultado.error || 'No se pudo completar el registro.');
    }

    // Redirige a la pantalla de monitoreo, pasando el id del excursionista.
    window.location.href = `monitor.html?id=${resultado.id}&nombre=${encodeURIComponent(resultado.nombre)}`;
  } catch (error) {
    mensajeError.textContent = error.message;
    mensajeError.classList.remove('d-none');
    btn.disabled = false;
    btn.textContent = 'Registrar e iniciar monitoreo';
  }
});
