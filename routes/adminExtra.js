// routes/adminExtra.js
// Estadisticas semanales y exportacion a Excel para el panel administrativo.

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { db } = require('../config/firebase');
const { calcularEstadisticasSemanales } = require('../services/estadisticas');

// GET /api/admin/estadisticas
router.get('/estadisticas', async (req, res) => {
  try {
    const resumen = await calcularEstadisticasSemanales(db);
    res.json(resumen);
  } catch (error) {
    console.error('Error al calcular estadisticas:', error);
    res.status(500).json({ error: 'No se pudieron calcular las estadisticas.' });
  }
});

// GET /api/admin/exportar
// Genera un archivo Excel (.xlsx) con una hoja por agencia (agrupando a
// sus excursionistas) y una hoja "Sin agencia" para el resto, mas una hoja
// de resumen general. Se genera al momento (no se guarda en el servidor)
// y se descarga directo al navegador de quien lo solicita.
router.get('/exportar', async (req, res) => {
  try {
    const [snapExc, snapAgencias] = await Promise.all([
      db.ref('excursionistas').once('value'),
      db.ref('agencias').once('value'),
    ]);
    const excursionistas = Object.values(snapExc.val() || {});
    const agencias = Object.values(snapAgencias.val() || {});

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Cumbre Segura';
    libro.created = new Date();

    const columnas = [
      { header: 'Nombre', key: 'nombre', width: 28 },
      { header: 'Telefono', key: 'telefono', width: 16 },
      { header: 'Personas en el grupo', key: 'personasGrupo', width: 10 },
      { header: 'Fecha de salida', key: 'fechaSalidaEstimada', width: 16 },
      { header: 'Hora de salida', key: 'horaSalidaEstimada', width: 14 },
      { header: 'Fecha de registro', key: 'fechaRegistro', width: 20 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Llego a la cima', key: 'cima', width: 14 },
    ];

    function filaDeExcursionista(e) {
      return {
        nombre: e.nombre || '',
        telefono: e.telefono || '',
        personasGrupo: e.personasGrupo || 1,
        fechaSalidaEstimada: e.fechaSalidaEstimada || '',
        horaSalidaEstimada: e.horaSalidaEstimada || '',
        fechaRegistro: e.fechaRegistro ? new Date(e.fechaRegistro).toLocaleString('es-GT') : '',
        estado: e.estado || '',
        cima: e.cumbreAlcanzada ? 'Si' : 'No',
      };
    }

    // Hoja de resumen
    const hojaResumen = libro.addWorksheet('Resumen');
    hojaResumen.columns = [
      { header: 'Agencia', key: 'agencia', width: 30 },
      { header: 'Representante', key: 'representante', width: 26 },
      { header: 'Cantidad de excursionistas', key: 'cantidad', width: 22 },
    ];
    hojaResumen.getRow(1).font = { bold: true };

    // Agrupar excursionistas por agencia
    const porAgencia = {};
    const sinAgencia = [];
    excursionistas.forEach((e) => {
      if (e.agenciaId && agencias.some((a) => a.id === e.agenciaId)) {
        if (!porAgencia[e.agenciaId]) porAgencia[e.agenciaId] = [];
        porAgencia[e.agenciaId].push(e);
      } else {
        sinAgencia.push(e);
      }
    });

    agencias.forEach((agencia) => {
      const lista = porAgencia[agencia.id] || [];
      hojaResumen.addRow({
        agencia: agencia.nombre,
        representante: agencia.representante || '-',
        cantidad: lista.length,
      });

      // Nombre de hoja: Excel no permite ciertos caracteres ni mas de 31.
      const nombreHoja = agencia.nombre.replace(/[\\/*?:\[\]]/g, '').substring(0, 31) || 'Agencia';
      const hoja = libro.addWorksheet(nombreHoja);
      hoja.columns = columnas;
      hoja.getRow(1).font = { bold: true };
      lista
        .sort((a, b) => (b.fechaRegistro || 0) - (a.fechaRegistro || 0))
        .forEach((e) => hoja.addRow(filaDeExcursionista(e)));
    });

    hojaResumen.addRow({
      agencia: 'Sin agencia (registro individual)',
      representante: '-',
      cantidad: sinAgencia.length,
    });

    const hojaSinAgencia = libro.addWorksheet('Sin agencia');
    hojaSinAgencia.columns = columnas;
    hojaSinAgencia.getRow(1).font = { bold: true };
    sinAgencia
      .sort((a, b) => (b.fechaRegistro || 0) - (a.fechaRegistro || 0))
      .forEach((e) => hojaSinAgencia.addRow(filaDeExcursionista(e)));

    const nombreArchivo = `cumbre-segura-excursionistas-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

    await libro.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar el Excel:', error);
    res.status(500).json({ error: 'No se pudo generar el archivo de Excel.' });
  }
});

module.exports = router;
