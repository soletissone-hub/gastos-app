/***********************
 * API JSON PARA PWA MÓVIL
 * Pegar este bloque al FINAL del script existente,
 * y REEMPLAZAR la función doGet() existente con la de abajo.
 ***********************/

// REEMPLAZAR el doGet() existente con este:
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action) return _pwaApi_(e.parameter);

  return HtmlService.createTemplateFromFile("dashboard")
    .evaluate()
    .setTitle("Gastos del Hogar")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Agregar estas funciones nuevas al final del script:
function _pwaApi_(p) {
  try {
    switch (p.action) {

      case 'getPendientes': {
        const todos = getDatosJSON();
        const pend = todos.filter(r =>
          r.Revisar === true || String(r.Revisar).toUpperCase() === 'TRUE'
        );
        return _json_({ ok: true, data: pend });
      }

      case 'getResumen': {
        const todos = getDatosJSON();
        const ahora = new Date();
        const mes = Utilities.formatDate(ahora, "America/Argentina/Buenos_Aires", "yyyy-MM");
        const mesActual = todos.filter(r => String(r.Periodo || '').startsWith(mes) && r.Revisar !== true && String(r.Revisar).toUpperCase() !== 'TRUE');
        const totalMes = mesActual.reduce((s, r) => s + (Number(r.Monto) || 0), 0);
        const pendientes = todos.filter(r => r.Revisar === true || String(r.Revisar).toUpperCase() === 'TRUE').length;
        return _json_({ ok: true, data: { totalMes, pendientes, mes } });
      }

      case 'getDatos':
        return _json_({ ok: true, data: getDatosJSON() });

      case 'getProveedores':
        return _json_({ ok: true, data: getProveedoresJSON() });

      case 'agregarGasto': {
        agregarGastoManual_({
          fecha: p.fecha,
          monto: Number(p.monto),
          categoria: p.categoria || 'Variable',
          proveedor: p.proveedor || '',
          hogar: p.hogar || '',
          detalle: p.detalle || p.proveedor || 'Gasto manual',
          persona: p.persona || ''
        });
        return _json_({ ok: true });
      }

      case 'clasificar': {
        clasificarFila_({
          gmailId: p.gmailId,
          proveedor: p.proveedor || '',
          categoria: p.categoria || 'Variable',
          hogar: p.hogar || '',
          guardarEnMapeo: p.guardarEnMapeo === 'true',
          destinatario: p.destinatario || '',
          esRubroNuevo: false,
          observaciones: p.observaciones || ''
        });
        return _json_({ ok: true });
      }

      default:
        return _json_({ ok: false, error: 'Accion no reconocida: ' + p.action });
    }
  } catch (err) {
    Logger.log('PWA API error: ' + err.message);
    return _json_({ ok: false, error: err.message });
  }
}

function _json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
