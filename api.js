const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyxkBwOV7qAJTV9HjrOyu1CBaSbqUXIHTECEx1Ljaa-BgY0DO27ZhwHfBfiZmNXLldV/exec';

async function apiGet(params) {
  const url = SCRIPT_URL + '?' + new URLSearchParams({ ...params, t: Date.now() });
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function apiFetchPendientes() {
  const r = await apiGet({ action: 'getPendientes' });
  if (!r.ok) throw new Error(r.error);
  return r.data || [];
}

async function apiGetResumen() {
  const r = await apiGet({ action: 'getResumen' });
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function apiAddExpense(p) {
  const r = await apiGet({
    action: 'agregarGasto',
    fecha: p.fecha,
    monto: p.monto,
    categoria: p.categoria || '',
    proveedor: p.proveedor || '',
    hogar: p.hogar || '',
    detalle: p.detalle || p.proveedor || '',
    persona: p.persona || ''
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}

async function apiClasificar(gmailId, categoria, proveedor, destinatario, hogar) {
  const r = await apiGet({
    action: 'clasificar',
    gmailId,
    categoria,
    proveedor,
    hogar: hogar || '',
    destinatario: destinatario || '',
    guardarEnMapeo: 'true'
  });
  if (!r.ok) throw new Error(r.error);
  return r;
}
