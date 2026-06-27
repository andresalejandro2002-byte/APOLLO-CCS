/**
 * APO.YA — Webhook de Telegram
 * 
 * Recibe cada mensaje del grupo, lo clasifica con Claude,
 * y actualiza el estado de inventario en Supabase.
 * 
 * Variables de entorno necesarias en Vercel:
 *   TELEGRAM_BOT_TOKEN
 *   ANTHROPIC_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  (la service_role key, NO la anon key)
 */

const INSUMOS = [
  "agua potable", "alimentos no perecederos", "comida preparada",
  "fórmula infantil", "gatorade", "jugos", "abrigo", "sábanas",
  "cobijas", "colchones", "ropa para adulto", "ropa para bebés",
  "alcohol antiséptico", "analgésicos", "antiinflamatorios",
  "gasas", "vendas", "medicina pediátrica", "vitaminas",
  "equipo de seguridad", "herramientas de rescate", "insumos médicos",
  "artículos de higiene", "medicamentos básicos"
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const update = req.body;

  // Ignorar updates sin mensaje
  const msg = update?.message || update?.channel_post;
  if (!msg) return res.status(200).json({ ok: true });

  const text = msg.text || msg.caption || '';
  const photo = msg.photo;
  const from = msg.from?.first_name || msg.from?.username || 'Anónimo';
  const timestamp = new Date(msg.date * 1000).toISOString();

  // Si no hay texto ni foto, ignorar
  if (!text && !photo) return res.status(200).json({ ok: true });

  try {
    // ── 1. Clasificar el mensaje con Claude ────────────────────────────
    const classification = await classifyWithClaude(text, photo, msg, from);

    // ── 2. Guardar el mensaje raw en Supabase ──────────────────────────
    await supabaseInsert('mensajes_telegram', {
      telegram_message_id: msg.message_id,
      from_name: from,
      text: text || null,
      has_photo: !!photo,
      tipo: classification.tipo,
      centro_mencionado: classification.centro,
      insumos: classification.insumos,
      cantidades: classification.cantidades,
      confianza: classification.confianza,
      timestamp,
      raw: JSON.stringify(msg)
    });

    // ── 3. Actualizar inventario del centro si hay match ───────────────
    if (classification.centro && classification.tipo && classification.confianza !== 'baja') {
      await actualizarInventario(classification);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Error procesando mensaje:', err);
    // Siempre devolver 200 a Telegram para que no reintente
    return res.status(200).json({ ok: true });
  }
}

// ── Clasificación con Claude ────────────────────────────────────────────────
async function classifyWithClaude(text, photo, msg, from) {
  const prompt = `Eres un sistema de clasificación humanitaria para Venezuela. Analiza este mensaje de Telegram.

MENSAJE: "${text || '(solo imagen)'}"
ENVIADO POR: ${from}

TAREA: Determina si este mensaje reporta:
1. NECESIDAD — un centro/refugio necesita insumos
2. DONACION — alguien está llevando o enviando insumos a un centro
3. IRRELEVANTE — no es sobre insumos ni centros de refugio

INSUMOS CONOCIDOS: ${INSUMOS.join(', ')}

Responde SOLO con este JSON (sin markdown):
{
  "tipo": "NECESIDAD" | "DONACION" | "IRRELEVANTE",
  "centro": "nombre del centro mencionado o null",
  "insumos": ["lista de insumos mencionados"],
  "cantidades": {"insumo": cantidad_numerica},
  "accion": "resumen en 1 línea de lo que dice el mensaje",
  "confianza": "alta" | "media" | "baja"
}

Si el mensaje es ambiguo o no menciona claramente un centro, usa confianza "baja".`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  const raw = data.content?.[0]?.text || '{}';

  try {
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    return { tipo: 'IRRELEVANTE', centro: null, insumos: [], cantidades: {}, confianza: 'baja' };
  }
}

// ── Actualizar inventario en Supabase ───────────────────────────────────────
async function actualizarInventario(classification) {
  // Buscar el centro por nombre aproximado
  const centros = await supabaseFetch(
    `centers?nombre=ilike.*${encodeURIComponent(classification.centro)}*&limit=1`
  );

  if (!centros?.length) return;

  const centro = centros[0];
  const inventarioActual = centro.inventario || {};

  if (classification.tipo === 'DONACION') {
    // Sumar lo que llegan
    for (const [insumo, cantidad] of Object.entries(classification.cantidades || {})) {
      const key = normalizarInsumo(insumo);
      inventarioActual[key] = Math.min(100, (inventarioActual[key] || 0) + calcularPct(cantidad));
    }
    // Si no hay cantidades específicas, subir 10% a los insumos mencionados
    if (!Object.keys(classification.cantidades || {}).length) {
      for (const insumo of classification.insumos || []) {
        const key = normalizarInsumo(insumo);
        inventarioActual[key] = Math.min(100, (inventarioActual[key] || 0) + 10);
      }
    }
  } else if (classification.tipo === 'NECESIDAD') {
    // Marcar insumos como críticos si se reportan como necesarios
    for (const insumo of classification.insumos || []) {
      const key = normalizarInsumo(insumo);
      if (!inventarioActual[key] || inventarioActual[key] > 30) {
        inventarioActual[key] = 15; // marca como bajo si no había dato
      }
    }
  }

  // Calcular status general
  const valores = Object.values(inventarioActual);
  const promedio = valores.length
    ? Math.round(valores.reduce((a, b) => a + b, 0) / valores.length)
    : 50;

  const status = promedio <= 25 ? 'critico' : promedio <= 60 ? 'moderado' : 'full';

  await supabasePatch(`centers?id=eq.${centro.id}`, {
    inventario: inventarioActual,
    status,
    ultimo_reporte: new Date().toISOString(),
    ultimo_mensaje: classification.accion
  });
}

// ── Helpers Supabase ────────────────────────────────────────────────────────
async function supabaseFetch(path) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
  });
  return r.json();
}

async function supabaseInsert(table, data) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
}

async function supabasePatch(path, data) {
  await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
}

function normalizarInsumo(insumo) {
  return insumo.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function calcularPct(cantidad) {
  // Heurística: 1-5 unidades = 5%, 6-20 = 10%, 21-50 = 20%, 50+ = 30%
  if (cantidad <= 5) return 5;
  if (cantidad <= 20) return 10;
  if (cantidad <= 50) return 20;
  return 30;
}
