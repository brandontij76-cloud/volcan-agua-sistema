// routes/agencias.js
// CRUD de agencias turisticas + asociacion de excursionistas a una agencia.

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { crearAgencia, listarAgencias, eliminarAgencia } = require('../services/agencias');
const { requiereAdmin } = require('../middleware/autenticacion');

// Publico: el formulario de registro (registro.html) necesita la lista de
// agencias para el desplegable, sin haber iniciado sesion.
router.get('/', async (req, res) => {
  try {
    const lista = await listarAgencias(db);
    res.json(lista);
  } catch (error) {
    console.error('Error al listar agencias:', error);
    res.status(500).json({ error: 'No se pudo obtener la lista de agencias.' });
  }
});

router.post('/', requiereAdmin, async (req, res) => {
  try {
    const { nombre, representante, telefono } = req.body;
    const nueva = await crearAgencia(db, { nombre, representante, telefono });
    res.status(201).json(nueva);
  } catch (error) {
    console.error('Error al crear agencia:', error);
    res.status(400).json({ error: error.message || 'No se pudo crear la agencia.' });
  }
});

router.delete('/:id', requiereAdmin, async (req, res) => {
  try {
    await eliminarAgencia(db, req.params.id);
    res.json({ mensaje: 'Agencia eliminada.' });
  } catch (error) {
    console.error('Error al eliminar agencia:', error);
    res.status(400).json({ error: error.message || 'No se pudo eliminar la agencia.' });
  }
});

module.exports = router;
