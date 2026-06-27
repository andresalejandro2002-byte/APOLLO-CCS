api/centers.js
 * APO.YA — Endpoint de centros
 * GET  /api/centers → lista todos los centros con su status
 * POST /api/centers → registra un centro nuevo (uso admin)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json'
  };

  // ── GET: devuelve todos los centros ordenados por status ───────────────
  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/centers?select=*&order=status.asc,nombre.asc`,
        { headers }
      );
      const data = await r.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: 'Error leyendo centros' });
    }
  }

  // ── POST: registra un centro nuevo ─────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, direccion, telefono, estado, municipio,
            horario, foto_url, maps_url, insumos_requeridos } = req.body;

    if (!nombre) return res.status(400).json({ error: 'nombre requerido' });

    const centro = {
      nombre,
      direccion: direccion || null,
      telefono: telefono || null,
      estado: estado || null,
      municipio: municipio || null,
      horario: horario || null,
      foto_url: foto_url || null,
      maps_url: maps_url || null,
      insumos_requeridos: insumos_requeridos || [],
      inventario: {},
      status: 'critico', // nuevo centro empieza crítico hasta recibir reportes
      ultimo_reporte: null,
      ultimo_mensaje: null,
      verificado: false,
      creado_en: new Date().toISOString()
    };

    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/centers`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(centro)
      });
      const data = await r.json();
      return res.status(201).json(data);
    } catch (err) {
      return res.status(500).json({ error: 'Error creando centro' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
