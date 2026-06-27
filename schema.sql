# 🍗 APO.YA v2 — Dashboard Telegram → Supabase

## Estructura del proyecto

```
apoya-v2/
├── index.html              ← Dashboard (3 pestañas: Crítico / Moderado / Full)
├── schema.sql              ← Ejecutar en Supabase SQL Editor
├── vercel.json             ← Configuración de rutas
├── README.md
└── api/
    ├── telegram.js         ← Webhook: recibe mensajes, llama a Claude, actualiza Supabase
    ├── centers.js          ← GET/POST centros
    └── setup-webhook.js    ← Registra el webhook con Telegram (ejecutar 1 sola vez)
```

---

## Setup paso a paso

### 1. Supabase — crear las tablas

1. Ve a **supabase.com** → tu proyecto → **SQL Editor** → New Query
2. Pega el contenido de `schema.sql` completo
3. Clic en **Run**
4. Verifica: `SELECT COUNT(*) FROM centers;` debe dar **12**

### 2. Supabase — obtener la Service Role Key

La anon key es solo para lectura. El webhook necesita la **service_role key** para escribir:

1. Supabase → Settings → API
2. Copia el valor de **service_role** (sección "Project API keys")
⚠️ Esta clave nunca va al frontend — solo a Vercel como variable de entorno.

### 3. GitHub — subir el proyecto

Sube todos los archivos a tu repositorio `apoya` en GitHub.
Puedes crear un repositorio nuevo o usar el que ya tienes.

### 4. Vercel — configurar variables de entorno

En Vercel → tu proyecto → Settings → Environment Variables, agrega estas 4:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | `8907063493:AAHa3GMr-WgRYx0YIz5UO92qHIvBBqG3L6o` |
| `ANTHROPIC_API_KEY` | `sk-ant-...` (tu clave de Anthropic) |
| `SUPABASE_URL` | `https://ifpgomrszerktvcmthyo.supabase.co` |
| `SUPABASE_SERVICE_KEY` | (la service_role key del paso 2) |

Luego haz **Redeploy**.

### 5. Registrar el webhook de Telegram

Una vez desplegado en Vercel, abre en el navegador:

```
https://TU-URL.vercel.app/api/setup-webhook
```

Verás una respuesta JSON confirmando que el webhook fue registrado. Esto le dice a Telegram que envíe todos los mensajes del grupo a tu app.

### 6. Verificar que funciona

En tu grupo de Telegram, escribe un mensaje de prueba como:
```
Llevando 5 cajas de agua al refugio de Petare
```

Espera 5 segundos y revisa el dashboard — el centro debería actualizarse.

---

## Flujo de datos

```
Mensaje en grupo Telegram
        ↓
Bot recibe (privacy mode OFF)
        ↓
Vercel /api/telegram
        ↓
Claude clasifica:
  tipo: DONACION / NECESIDAD
  centro: "nombre del centro"
  insumos: ["agua potable"]
  cantidades: {agua: 5}
        ↓
Supabase actualiza inventario
        ↓
Dashboard lee cada 30 segundos
```

---

## Cómo ajustar el privacy mode del bot

En Telegram, habla con @BotFather:
```
/setprivacy
→ selecciona @apoya_ve_bot (o como lo hayas llamado)
→ Disable
```

Luego saca al bot del grupo y vuelve a añadirlo como administrador.

---

*por Venezolanos para Venezuela — AS 2026*
