// routes/colaboradores.js
// Endpoints para que el administrador cree y gestione cuentas de
// colaboradores (personas en la cima con acceso limitado a "Tiempo real"),
// y para que esos colaboradores inicien sesion.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const {
  crearColaborador,
  iniciarSesionColaborador,
  listarColaboradores,
  cambiarEstadoColaborador,
  eliminarColaborador,
} = require('../services/colaboradores');

// POST /api/colaboradores/login
// Usado por la pantalla de acceso de colaboradores (no el admin).
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const resultado = await iniciarSesionColaborador(db, { usuario, password });
    if (!resultado.ok) {
      return res.status(401).json({ error: resultado.error });
    }
    res.json(resultado.colaborador);
  } catch (error) {
    console.error('Error en login de colaborador:', error);
    res.status(500).json({ error: 'No se pudo iniciar sesion.' });
  }
});

// GET /api/colaboradores
// Lista de colaboradores + su historial de accesos, para el panel del admin.
router.get('/', async (req, res) => {
  try {
    const lista = await listarColaboradores(db);
    res.json(lista);
  } catch (error) {
    console.error('Error al listar colaboradores:', error);
    res.status(500).json({ error: 'No se pudo obtener la lista de colaboradores.' });
  }
});

// POST /api/colaboradores
// El administrador crea una cuenta nueva (usuario = correo o telefono).
router.post('/', async (req, res) => {
  try {
    const { usuario, password, nombre } = req.body;
    const nuevo = await crearColaborador(db, { usuario, password, nombre });
    res.status(201).json(nuevo);
  } catch (error) {
    console.error('Error al crear colaborador:', error);
    res.status(400).json({ error: error.message || 'No se pudo crear el colaborador.' });
  }
});

// PATCH /api/colaboradores/:id/estado
// Activar o desactivar una cuenta (body: { activo: true|false }).
router.patch('/:id/estado', async (req, res) => {
  try {
    await cambiarEstadoColaborador(db, req.params.id, req.body.activo);
    res.json({ mensaje: 'Estado actualizado.' });
  } catch (error) {
    console.error('Error al cambiar estado de colaborador:', error);
    res.status(400).json({ error: error.message || 'No se pudo actualizar el colaborador.' });
  }
});

// DELETE /api/colaboradores/:id
router.delete('/:id', async (req, res) => {
  try {
    await eliminarColaborador(db, req.params.id);
    res.json({ mensaje: 'Colaborador eliminado.' });
  } catch (error) {
    console.error('Error al eliminar colaborador:', error);
    res.status(400).json({ error: error.message || 'No se pudo eliminar el colaborador.' });
  }
});

module.exports = router;
