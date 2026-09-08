// routes/adminExtra.js
// Estadisticas semanales y exportacion a Excel para el panel administrativo.

const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const { db } = require('../config/firebase');
const { calcularEstadisticasSemanales } = require('../services/estadisticas');
const { generarReporteSemanalIA } = require('../services/asistenteIA');
const { requiereAdmin } = require('../middleware/autenticacion');

// Todas las rutas de este archivo son exclusivas del panel administrativo.
router.use(requiereAdmin);

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

// GET /api/admin/reporte-semanal
// Reporte de la semana de calendario (lunes a domingo) redactado por IA
// (Gemini), con respaldo honesto por reglas si Gemini no esta disponible.
// Query opcional: ?offsetSemanas=-1 para pedir la semana pasada, etc.
router.get('/reporte-semanal', async (req, res) => {
  try {
    const offsetSemanas = parseInt(req.query.offsetSemanas, 10) || 0;
    const reporte = await generarReporteSemanalIA(db, { offsetSemanas });
    res.json(reporte);
  } catch (error) {
    console.error('Error al generar el reporte semanal:', error);
    res.status(500).json({ error: 'No se pudo generar el reporte semanal.' });
  }
});

// GET /api/admin/reporte-semanal/excel
// Mismo reporte semanal (redactado por IA), pero descargable como archivo
// Excel con formato profesional: encabezado, parrafo del reporte, tabla de
// metricas con simbolos identificadores y comparacion contra la semana
// anterior. Se genera al momento, no se guarda en el servidor.
router.get('/reporte-semanal/excel', async (req, res) => {
  try {
    const offsetSemanas = parseInt(req.query.offsetSemanas, 10) || 0;
    const reporte = await generarReporteSemanalIA(db, { offsetSemanas });
    const { estadisticas: r, estadisticasSemanaAnterior: rAnt, rangoSemana } = reporte;

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Cumbre Segura';
    libro.created = new Date();

    const hoja = libro.addWorksheet('Reporte semanal');
    hoja.columns = [
      { key: 'icono', width: 5 },
      { key: 'metrica', width: 32 },
      { key: 'estaSemana', width: 16 },
      { key: 'semanaAnterior', width: 18 },
    ];

    const VERDE = 'FF22C55E';
    const VERDE_SUAVE = 'FFDCFCE7';
    const ROJO_SUAVE = 'FFFEE2E2';
    const GRIS_SUAVE = 'FFF3F4F6';
    const TEXTO_OSCURO = 'FF16211B';

    // --- Titulo ---
    const filaTitulo = hoja.addRow(['📊 Reporte Semanal — Cumbre Segura']);
    hoja.mergeCells(filaTitulo.number, 1, filaTitulo.number, 4);
    filaTitulo.height = 26;
    filaTitulo.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    filaTitulo.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    filaTitulo.eachCell((celda) => { celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }; });

    const filaSubtitulo = hoja.addRow([`Semana del ${rangoSemana.texto}`]);
    hoja.mergeCells(filaSubtitulo.number, 1, filaSubtitulo.number, 4);
    filaSubtitulo.font = { italic: true, color: { argb: 'FF6B7280' } };

    const filaOrigen = hoja.addRow([reporte.generadoConIA ? '✨ Redactado con IA (Gemini)' : '🤖 Redactado por reglas (IA no disponible en este momento)']);
    hoja.mergeCells(filaOrigen.number, 1, filaOrigen.number, 4);
    filaOrigen.font = { size: 10, color: { argb: 'FF6B7280' } };

    hoja.addRow([]);

    // --- Parrafo del reporte ---
    const filaResumenTitulo = hoja.addRow(['Resumen de la semana']);
    hoja.mergeCells(filaResumenTitulo.number, 1, filaResumenTitulo.number, 4);
    filaResumenTitulo.font = { bold: true, size: 12, color: { argb: TEXTO_OSCURO } };

    const filaReporte = hoja.addRow([reporte.reporte]);
    hoja.mergeCells(filaReporte.number, 1, filaReporte.number, 4);
    filaReporte.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    filaReporte.height = 70;

    hoja.addRow([]);

    // --- Tabla de metricas ---
    const filaMetricasTitulo = hoja.addRow(['Métricas de la semana']);
    hoja.mergeCells(filaMetricasTitulo.number, 1, filaMetricasTitulo.number, 4);
    filaMetricasTitulo.font = { bold: true, size: 12, color: { argb: TEXTO_OSCURO } };

    const filaEncabezado = hoja.addRow(['', 'Métrica', 'Esta semana', 'Semana anterior']);
    filaEncabezado.font = { bold: true };
    filaEncabezado.eachCell((celda) => {
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_SUAVE } };
      celda.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } };
    });

    function agregarFilaMetrica(icono, etiqueta, valorActual, valorAnterior, resaltarSiPositivo) {
      const fila = hoja.addRow([icono, etiqueta, valorActual, valorAnterior]);
      if (resaltarSiPositivo && valorActual > 0) {
        fila.eachCell((celda) => { celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_SUAVE } }; });
      }
      return fila;
    }

    agregarFilaMetrica('👥', 'Excursionistas registrados', r.totalRegistrados, rAnt.totalRegistrados);
    agregarFilaMetrica('🏔️', 'Llegaron a la cima', r.cimaAlcanzada, rAnt.cimaAlcanzada);
    agregarFilaMetrica('🚩', 'Finalizaron el recorrido', r.finalizados, rAnt.finalizados);
    agregarFilaMetrica('🔔', 'Total de alertas', r.totalAlertas, rAnt.totalAlertas);
    agregarFilaMetrica('✅', 'Alertas atendidas', r.alertasAtendidas, rAnt.alertasAtendidas);
    agregarFilaMetrica('⚠️', 'Alertas sin atender', r.alertasSinAtender, rAnt.alertasSinAtender, true);

    hoja.addRow([]);
    const filaNivelesTitulo = hoja.addRow(['Alertas por nivel esta semana']);
    hoja.mergeCells(filaNivelesTitulo.number, 1, filaNivelesTitulo.number, 4);
    filaNivelesTitulo.font = { bold: true, size: 11, color: { argb: TEXTO_OSCURO } };

    agregarFilaMetrica('🟢', 'Leves', r.alertasPorNivel.leve, rAnt.alertasPorNivel.leve);
    agregarFilaMetrica('🟡', 'Moderadas', r.alertasPorNivel.moderada, rAnt.alertasPorNivel.moderada);
    agregarFilaMetrica('🔴', 'Graves', r.alertasPorNivel.grave, rAnt.alertasPorNivel.grave, true);

    // --- Modelo de IA de riesgo (si hay datos suficientes) ---
    if (reporte.riesgo?.muestraSuficiente) {
      hoja.addRow([]);
      const filaIATitulo = hoja.addRow(['Modelo de IA de riesgo']);
      hoja.mergeCells(filaIATitulo.number, 1, filaIATitulo.number, 4);
      filaIATitulo.font = { bold: true, size: 12, color: { argb: TEXTO_OSCURO } };

      agregarFilaMetrica('🤖', 'Recorridos históricos usados para entrenar', reporte.riesgo.totalMuestras, '-');
      agregarFilaMetrica('📈', 'Riesgo estimado (salida 6:00 a.m.)', `${reporte.riesgo.probabilidadRiesgo}%`, '-');
      if (reporte.riesgo.metricas?.exactitud != null) {
        agregarFilaMetrica('🎯', 'Exactitud del modelo', `${reporte.riesgo.metricas.exactitud}%`, '-');
      }
    }

    hoja.addRow([]);
    const filaPie = hoja.addRow([`Generado automáticamente por Cumbre Segura · ${new Date().toLocaleString('es-GT')}`]);
    hoja.mergeCells(filaPie.number, 1, filaPie.number, 4);
    filaPie.font = { size: 9, italic: true, color: { argb: 'FF9CA3AF' } };

    const nombreArchivo = `cumbre-segura-reporte-semanal-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);

    await libro.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar el Excel del reporte semanal:', error);
    res.status(500).json({ error: 'No se pudo generar el Excel del reporte semanal.' });
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
    const excursionistas = Object.values(snapExc.val() || {}).filter((e) => e.estado !== 'pendiente');
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
      hoja.columns = columnas.map((c) => ({ key: c.key, width: c.width }));

      // Encabezado visible con el nombre de la empresa (ademas del nombre
      // de la pestaña), para que quede claro al abrir la hoja a cual
      // agencia pertenece esta lista de excursionistas.
      const filaTitulo = hoja.addRow([`Empresa de excursión: ${agencia.nombre}`]);
      hoja.mergeCells(filaTitulo.number, 1, filaTitulo.number, columnas.length);
      filaTitulo.font = { bold: true, size: 13 };

      const filaEncabezados = hoja.addRow(columnas.map((c) => c.header));
      filaEncabezados.font = { bold: true };

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
    hojaSinAgencia.columns = columnas.map((c) => ({ key: c.key, width: c.width }));

    const filaTituloSinAgencia = hojaSinAgencia.addRow(['Excursionistas independientes (sin agencia)']);
    hojaSinAgencia.mergeCells(filaTituloSinAgencia.number, 1, filaTituloSinAgencia.number, columnas.length);
    filaTituloSinAgencia.font = { bold: true, size: 13 };

    const filaEncabezadosSinAgencia = hojaSinAgencia.addRow(columnas.map((c) => c.header));
    filaEncabezadosSinAgencia.font = { bold: true };

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
