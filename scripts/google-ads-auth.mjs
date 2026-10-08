// Obtiene el refresh token de OAuth para la Google Ads API (flujo de escritorio con loopback + PKCE).
//   npm run keywords:auth
// Necesita GOOGLE_ADS_CLIENT_ID y GOOGLE_ADS_CLIENT_SECRET en .env (cliente OAuth de tipo «Aplicación de escritorio»).
// Si existe .env, guarda ahí GOOGLE_ADS_REFRESH_TOKEN; si no, lo muestra para que lo copies.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, ".env");
const SCOPE = "https://www.googleapis.com/auth/adwords";
const clientId = process.env.GOOGLE_ADS_CLIENT_ID, clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Faltan GOOGLE_ADS_CLIENT_ID y/o GOOGLE_ADS_CLIENT_SECRET.\nCopia .env.example a .env, rellénalos y vuelve a ejecutar `npm run keywords:auth`.");
  process.exit(1);
}

const b64url = buf => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const verifier = b64url(crypto.randomBytes(48));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

function saveEnv(file, key, value) {
  const line = `${key}=${value}`;
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const re = new RegExp(`^${key}=.*$`, "m");
  fs.writeFileSync(file, re.test(text) ? text.replace(re, line) : text + (text && !text.endsWith("\n") ? "\n" : "") + line + "\n", { mode: 0o600 });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1");
  if (u.pathname !== "/") { res.writeHead(404); return res.end(); }
  const finish = (code, msg) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(`<!doctype html><meta charset="utf-8"><title>Google Ads API</title><body style="font-family:system-ui;max-width:560px;margin:60px auto"><h1>${msg}</h1><p>Ya puedes cerrar esta pestaña y volver a la terminal.</p>`); };
  if (u.searchParams.get("state") !== state) return finish(400, "Petición no válida (state).");
  if (u.searchParams.get("error")) { finish(400, "Autorización cancelada."); console.error("Google devolvió:", u.searchParams.get("error")); return server.close(); }
  const code = u.searchParams.get("code");
  if (!code) return finish(400, "Falta el código de autorización.");
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier })
    });
    const data = await r.json();
    if (!r.ok || !data.refresh_token) throw new Error(data.error_description || data.error || "Google no devolvió refresh token (revoca el acceso previo de la app en tu cuenta de Google y repite).");
    finish(200, "✅ Autorización completada");
    if (fs.existsSync(ENV_FILE)) { saveEnv(ENV_FILE, "GOOGLE_ADS_REFRESH_TOKEN", data.refresh_token); console.log("\n✅ Refresh token guardado en .env (GOOGLE_ADS_REFRESH_TOKEN). Arranca con `npm start`."); }
    else console.log(`\n✅ Refresh token:\n\nGOOGLE_ADS_REFRESH_TOKEN=${data.refresh_token}\n\nAñádelo a tu .env.`);
    console.log("Nota: si tu app OAuth está en modo «Prueba» en Google Cloud, el token caduca a los 7 días. Publícala (modo «En producción») para que no caduque.");
  } catch (e) {
    finish(500, "No se pudo obtener el token.");
    console.error("Error:", e.message);
    process.exitCode = 1;
  }
  server.close();
});

let redirectUri;
server.listen(0, "127.0.0.1", () => {
  redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  console.log("Abre esta URL en tu navegador e inicia sesión con el usuario que tiene acceso a tu cuenta de Google Ads:\n\n" + auth.href + "\n\nEsperando la autorización…");
});
