
const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 8080;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
if(IS_PRODUCTION && JWT_SECRET.length < 32){
  throw new Error('SEGURIDAD: JWT_SECRET debe existir y tener al menos 32 caracteres en producción.');
}

const RESEND_API_KEY = cleanEnv(process.env.RESEND_API_KEY);
const RESEND_FROM = cleanEnv(process.env.RESEND_FROM || 'Acreditaciones IDV <onboarding@resend.dev>');

function cleanEnv(v){ return String(v ?? '').trim(); }

const mailConfigured = Boolean(RESEND_API_KEY && RESEND_FROM);

const LIBERTADORES_MANUAL_URL = 'https://www.conmebol.com/documentos/nrh-manual-de-clubes-conmebol-libertadores-2026/';

function detectCompetition(title='', explicit='auto'){
  const selected = String(explicit || 'auto').trim().toLowerCase();
  if(['libertadores','sudamericana','copa_ecuador','other'].includes(selected)) return selected;

  const normalized = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();

  if(normalized.includes('libertadores')) return 'libertadores';
  if(normalized.includes('sudamericana')) return 'sudamericana';
  if(normalized.includes('copa ecuador')) return 'copa_ecuador';
  return 'other';
}

function competitionLabel(value){
  if(value==='libertadores') return 'CONMEBOL Libertadores';
  if(value==='sudamericana') return 'CONMEBOL Sudamericana';
  if(value==='copa_ecuador') return 'Copa Ecuador';
  return 'Otra competición';
}

function accreditationTypeLabel(value, category='press'){
  if(category==='photo' || value==='fotografo') return 'Fotógrafo';
  const labels={
    medio_digital:'Medio digital',
    prensa_escrita:'Prensa escrita',
    radio:'Radio',
    tv:'TV',
    camarografo:'Camarógrafo'
  };
  return labels[value] || 'Medio de comunicación';
}

function accreditationRestriction(value){
  return value==='camarografo' ? 'Solo sala de rueda de prensa' : '';
}



async function sendInterviewNotificationEmail(row){
  if(!mailConfigured || !INTERVIEW_NOTIFY_EMAIL){
    return {
      sent:false,
      warning:'La solicitud fue guardada, pero el correo interno de entrevistas no está configurado.'
    };
  }

  const html=`<!doctype html>
  <html lang="es">
  <body style="margin:0;background:#05070b;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05070b;padding:28px 14px">
      <tr><td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#0d1119;border:1px solid #263248;border-radius:20px;overflow:hidden">
          <tr><td style="padding:28px;background:#07111f;border-bottom:1px solid #21304a">
            <div style="font-size:11px;letter-spacing:2px;color:#93b4ff;font-weight:bold">INDEPENDIENTE DEL VALLE · PRENSA</div>
            <h1 style="margin:10px 0 0;color:#fff;font-size:28px">Solicitud de entrevista</h1>
          </td></tr>
          <tr><td style="padding:28px">
            <p style="color:#d8e2f6;line-height:1.6;margin-top:0">Se recibió una nueva solicitud de entrevista para revisión del Departamento de Comunicación y Prensa.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090d14;border:1px solid #263248;border-radius:14px">
              <tr><td style="padding:12px 16px;color:#8297ba">ENTREVISTADO</td><td style="padding:12px 16px;color:#fff;font-weight:bold">${escapeHtml(row.interviewee)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">TEMAS</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.topics)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">MEDIO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.media_name)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">PROGRAMA</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.program_name)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">PERIODISTA(S)</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.journalists)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">DÍA / HORARIO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.requested_day)} · ${escapeHtml(row.requested_time)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">TIEMPO MÁXIMO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(String(row.max_duration))} minutos</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">VÍA</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(interviewModeLabel(row.interview_mode))}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">CONTACTO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.email)} · ${escapeHtml(row.phone)}</td></tr>
            </table>
            <p style="margin:20px 0 0;color:#8fa2c4;font-size:12px">Código: <strong style="color:#cbd8ef">${escapeHtml(row.public_code)}</strong></p>
            <p style="color:#8fa2c4;font-size:12px">Revisa y aprueba o rechaza esta solicitud desde el panel interno de IDV.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${RESEND_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from:RESEND_FROM,
      to:[INTERVIEW_NOTIFY_EMAIL],
      subject:`Solicitud de entrevista · ${row.interviewee} · ${row.media_name}`,
      html,
      text:`Nueva solicitud de entrevista IDV

Entrevistado: ${row.interviewee}
Temas: ${row.topics}
Medio: ${row.media_name}
Programa: ${row.program_name}
Periodista(s): ${row.journalists}
Día: ${row.requested_day}
Horario: ${row.requested_time}
Tiempo máximo: ${row.max_duration} minutos
Vía: ${interviewModeLabel(row.interview_mode)}
Contacto: ${row.email} · ${row.phone}
Código: ${row.public_code}

Revisar en el panel interno de IDV.`
    })
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(`Resend: ${data?.message || data?.error || `HTTP ${response.status}`}`);
  }
  return {sent:true,id:data.id || null};
}

async function sendInterviewDecisionEmail(row){
  if(!mailConfigured || !row.email){
    return {sent:false,warning:'No se pudo enviar el correo de respuesta.'};
  }

  const approved=row.status==='approved';
  const title=approved ? 'Solicitud de entrevista aprobada' : 'Solicitud de entrevista no aprobada';
  const resultText=approved
    ? 'El Departamento de Comunicación y Prensa ha aprobado tu solicitud de entrevista.'
    : 'El Departamento de Comunicación y Prensa no ha aprobado esta solicitud de entrevista.';
  const pressMessage=approved ? INTERVIEW_APPROVAL_MESSAGE : (row.admin_notes || '');

  const html=`<!doctype html>
  <html lang="es">
  <body style="margin:0;background:#05070b;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05070b;padding:28px 14px">
      <tr><td align="center">
        <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#0d1119;border:1px solid #263248;border-radius:20px;overflow:hidden">
          <tr><td style="padding:28px;background:#07111f;border-bottom:1px solid #21304a">
            <div style="font-size:11px;letter-spacing:2px;color:#93b4ff;font-weight:bold">INDEPENDIENTE DEL VALLE · PRENSA</div>
            <h1 style="margin:10px 0 0;color:#fff;font-size:28px">${title}</h1>
          </td></tr>
          <tr><td style="padding:28px">
            <p style="color:#d8e2f6;line-height:1.6">${resultText}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090d14;border:1px solid #263248;border-radius:14px">
              <tr><td style="padding:12px 16px;color:#8297ba">ENTREVISTADO</td><td style="padding:12px 16px;color:#fff;font-weight:bold">${escapeHtml(row.interviewee)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">MEDIO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.media_name)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">DÍA / HORARIO SOLICITADO</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(row.requested_day)} · ${escapeHtml(row.requested_time)}</td></tr>
              <tr><td style="padding:12px 16px;color:#8297ba;border-top:1px solid #1c2637">VÍA</td><td style="padding:12px 16px;color:#fff;border-top:1px solid #1c2637">${escapeHtml(interviewModeLabel(row.interview_mode))}</td></tr>
            </table>
            ${pressMessage ? `<div style="margin-top:18px;padding:14px 16px;background:#0b1628;border:1px solid #315b9b;border-radius:12px;color:#d8e2f6"><strong>Mensaje de Prensa IDV:</strong><br>${escapeHtml(pressMessage)}</div>` : ''}
            <p style="margin:20px 0 0;color:#8fa2c4;font-size:12px">Código de solicitud: ${escapeHtml(row.public_code)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;

  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{
      'Authorization':`Bearer ${RESEND_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from:RESEND_FROM,
      to:[row.email],
      subject:`${title} · Independiente del Valle`,
      html,
      text:`${title}

${resultText}

Entrevistado: ${row.interviewee}
Medio: ${row.media_name}
Día / horario solicitado: ${row.requested_day} · ${row.requested_time}
Vía: ${interviewModeLabel(row.interview_mode)}
${pressMessage ? `Mensaje de Prensa IDV: ${pressMessage}` : ''}

Código: ${row.public_code}`
    })
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(`Resend: ${data?.message || data?.error || `HTTP ${response.status}`}`);
  }
  return {sent:true,id:data.id || null};
}

async function sendApprovalEmail(requestRow){
  if(!mailConfigured){
    return {
      sent:false,
      warning:'Resend no está configurado. Agrega RESEND_API_KEY en Railway.'
    };
  }

  const verifyUrl = `${PUBLIC_URL}/verificar.html?t=${encodeURIComponent(requestRow.verify_token)}`;
  const statusUrl = `${PUBLIC_URL}/estado.html?codigo=${encodeURIComponent(requestRow.public_code)}`;
  const qrUrl = `${PUBLIC_URL}/api/public/qr/${encodeURIComponent(requestRow.verify_token)}`;

  const fullName = `${requestRow.first_name} ${requestRow.last_name}`.trim();
  const typeLabel = accreditationTypeLabel(requestRow.accreditation_type, requestRow.category);
  const assignment = requestRow.assignment ? requestRow.assignment : 'Por asignar';
  const accessRestriction = accreditationRestriction(requestRow.accreditation_type);
  const competition = detectCompetition(requestRow.event_title, requestRow.competition || 'auto');
  const isLibertadores = competition === 'libertadores';

  const libertadoresEmailBlock = isLibertadores ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1628;border:1px solid #315b9b;border-radius:16px;margin:24px 0">
      <tr>
        <td style="padding:20px">
          <div style="font-size:12px;letter-spacing:1.5px;color:#8fb4ff;font-weight:bold">INFORMACIÓN CONMEBOL LIBERTADORES</div>
          <h2 style="margin:8px 0 10px;font-size:20px;color:#ffffff">Manual de Clubes · Libertadores 2026</h2>
          <p style="margin:0 0 16px;color:#d8e2f6;font-size:14px;line-height:1.6">
            Antes de la cobertura, revisa las disposiciones para medios, grabaciones, titulares y no titulares de derechos establecidas por CONMEBOL.
          </p>
          <a href="${LIBERTADORES_MANUAL_URL}" style="display:inline-block;background:#ffffff;color:#0b1d3a;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:bold">
            Abrir Manual de Clubes
          </a>
        </td>
      </tr>
    </table>` : '';

  const html = `<!doctype html>
  <html lang="es">
  <body style="margin:0;background:#05070b;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#05070b;padding:30px 14px">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;width:100%;background:#0d1119;border:1px solid #263248;border-radius:22px;overflow:hidden">
            <tr>
              <td style="padding:30px;background:#07111f;border-bottom:1px solid #21304a">
                <div style="font-size:12px;letter-spacing:2px;color:#93b4ff;font-weight:bold">INDEPENDIENTE DEL VALLE · ACREDITACIONES</div>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.15;color:#ffffff">Acreditación aprobada</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px">
                <p style="margin:0 0 18px;color:#d8e2f6;font-size:16px;line-height:1.6">
                  Hola <strong style="color:#ffffff">${escapeHtml(fullName)}</strong>, tu solicitud de acreditación fue aprobada.
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#090d14;border:1px solid #263248;border-radius:16px;margin:20px 0">
                  <tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px">EVENTO</td><td style="padding:14px 18px;color:#ffffff;font-weight:bold">${escapeHtml(requestRow.event_title || '')}</td></tr>
                  <tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px;border-top:1px solid #1c2637">MEDIO</td><td style="padding:14px 18px;color:#ffffff;border-top:1px solid #1c2637">${escapeHtml(requestRow.media_name)}</td></tr>
                  <tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px;border-top:1px solid #1c2637">NACIONALIDAD</td><td style="padding:14px 18px;color:#ffffff;border-top:1px solid #1c2637">${escapeHtml(requestRow.nationality || '')}</td></tr>
                  <tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px;border-top:1px solid #1c2637">TIPO</td><td style="padding:14px 18px;color:#ffffff;border-top:1px solid #1c2637">${typeLabel}</td></tr>
                  <tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px;border-top:1px solid #1c2637">ASIGNACIÓN</td><td style="padding:14px 18px;color:#ffffff;border-top:1px solid #1c2637">${escapeHtml(assignment)}</td></tr>
                  ${accessRestriction ? `<tr><td style="padding:14px 18px;color:#8fa2c4;font-size:12px;border-top:1px solid #1c2637">RESTRICCIÓN</td><td style="padding:14px 18px;color:#ffcf7a;font-weight:bold;border-top:1px solid #1c2637">${escapeHtml(accessRestriction)}</td></tr>` : ''}
                </table>

                ${libertadoresEmailBlock}

                <p style="color:#d8e2f6;font-size:15px;line-height:1.6">
                  Presenta este código QR el día del partido. Si tu correo bloquea imágenes externas, usa el botón inferior para abrir tu acreditación.
                </p>

                <div style="text-align:center;margin:24px 0">
                  <a href="${verifyUrl}" style="text-decoration:none">
                    <img src="${qrUrl}" width="220" height="220" alt="QR de acreditación" style="display:inline-block;background:#ffffff;padding:12px;border-radius:18px">
                  </a>
                </div>

                <div style="text-align:center;margin:26px 0">
                  <a href="${statusUrl}" style="display:inline-block;background:#245fe6;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:bold">
                    Ver mi acreditación y QR
                  </a>
                </div>

                <p style="margin:22px 0 0;color:#8fa2c4;font-size:12px;line-height:1.6">
                  Código de solicitud: <strong style="color:#c8d7f5">${escapeHtml(requestRow.public_code)}</strong><br>
                  Si el botón no funciona, abre este enlace:<br>
                  <span style="color:#8eb0ff">${statusUrl}</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;

  const text = `Hola ${fullName},

Tu acreditación fue aprobada.

Evento: ${requestRow.event_title || ''}
Medio: ${requestRow.media_name}
Tipo: ${typeLabel}
Asignación: ${assignment}
${accessRestriction ? `Restricción de acceso: ${accessRestriction}\n` : ''}${isLibertadores ? `\nManual de Clubes CONMEBOL Libertadores 2026:\n${LIBERTADORES_MANUAL_URL}\n` : ''}
Consulta tu acreditación y QR:
${statusUrl}

Validación directa:
${verifyUrl}

Código: ${requestRow.public_code}

Independiente del Valle · Acreditaciones`;

  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${RESEND_API_KEY}`,
      'Content-Type':'application/json'
    },
    body:JSON.stringify({
      from: RESEND_FROM,
      to: [requestRow.email],
      subject: `Acreditación aprobada · ${requestRow.event_title || 'Independiente del Valle'}`,
      html,
      text
    })
  });

  const data = await response.json().catch(()=>({}));

  if(!response.ok){
    const message = data?.message || data?.error || `HTTP ${response.status}`;
    throw new Error(`Resend: ${message}`);
  }

  return {sent:true,id:data.id || null};
}

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  })[ch]);
}


const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'idv-acreditaciones.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  opponent TEXT DEFAULT '',
  event_date TEXT NOT NULL,
  venue TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  public_code TEXT UNIQUE NOT NULL,
  verify_token TEXT UNIQUE,
  category TEXT NOT NULL CHECK(category IN ('press','photo')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  document TEXT NOT NULL,
  media_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  coverage TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','delivered')),
  assignment TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  delivered_at TEXT,
  attendance_status TEXT NOT NULL DEFAULT 'absent' CHECK(attendance_status IN ('absent','present')),
  attendance_at TEXT,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE(event_id, document)
);

CREATE INDEX IF NOT EXISTS idx_requests_event ON requests(event_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_code ON requests(public_code);

CREATE TABLE IF NOT EXISTS interview_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_code TEXT UNIQUE NOT NULL,
  interviewee TEXT NOT NULL,
  topics TEXT NOT NULL,
  media_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  journalists TEXT NOT NULL,
  requested_day TEXT NOT NULL,
  requested_time TEXT NOT NULL,
  max_duration INTEGER NOT NULL,
  interview_mode TEXT NOT NULL CHECK(interview_mode IN ('radial','presencial','zoom')),
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  admin_notes TEXT DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_interview_status ON interview_requests(status);
CREATE INDEX IF NOT EXISTS idx_interview_submitted ON interview_requests(submitted_at DESC);

CREATE TABLE IF NOT EXISTS vest_loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  request_id INTEGER NOT NULL UNIQUE,
  vest_number TEXT NOT NULL,
  credential_retained INTEGER NOT NULL DEFAULT 1,
  checkout_signature TEXT NOT NULL,
  checkout_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  return_signature TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'out' CHECK(status IN ('out','returned')),
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(request_id) REFERENCES requests(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vest_active_number
ON vest_loans(event_id, vest_number)
WHERE status='out';

CREATE TABLE IF NOT EXISTS admin_sessions (
  jti TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp
ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_id TEXT DEFAULT '',
  details TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
ON audit_logs(created_at DESC);
`);

function addColumnIfMissing(table, column, definition){
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if(!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumnIfMissing('requests', 'attendance_status', `TEXT NOT NULL DEFAULT 'absent'`);
addColumnIfMissing('requests', 'attendance_at', `TEXT`);
addColumnIfMissing('events', 'competition', `TEXT NOT NULL DEFAULT 'other'`);
addColumnIfMissing('requests', 'accreditation_type', `TEXT NOT NULL DEFAULT 'prensa_escrita'`);
addColumnIfMissing('requests', 'nationality', `TEXT NOT NULL DEFAULT ''`);

db.prepare(`UPDATE events SET competition='libertadores' WHERE competition='other' AND LOWER(title) LIKE '%libertadores%'`).run();
db.prepare(`UPDATE events SET competition='sudamericana' WHERE competition='other' AND LOWER(title) LIKE '%sudamericana%'`).run();
db.prepare(`UPDATE events SET competition='copa_ecuador' WHERE competition='other' AND LOWER(title) LIKE '%copa ecuador%'`).run();

// Las solicitudes antiguas de fotógrafos deben conservar su tipo correcto.
db.prepare(`UPDATE requests SET accreditation_type='fotografo' WHERE category='photo' AND accreditation_type<>'fotografo'`).run();

const adminEmail = String(
  process.env.ADMIN_EMAIL ||
  process.env['CORREO ELECTRÓNICO DEL ADMINISTRADOR'] ||
  (IS_PRODUCTION ? '' : 'prensa@idv.ec')
).trim().toLowerCase();

const adminPassword = String(
  process.env.ADMIN_PASSWORD ||
  process.env.ADMIN_CONTRASEÑA ||
  (IS_PRODUCTION ? '' : 'IDV2026!')
);

if(IS_PRODUCTION && !adminEmail){
  throw new Error('SEGURIDAD: ADMIN_EMAIL es obligatorio en producción.');
}
if(IS_PRODUCTION && adminPassword.length < 12){
  throw new Error('SEGURIDAD: ADMIN_PASSWORD debe tener al menos 12 caracteres en producción.');
}

if (adminEmail && !db.prepare('SELECT id FROM admins WHERE email=?').get(adminEmail)) {
  db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)')
    .run(adminEmail, bcrypt.hashSync(adminPassword, 12));
}

const INTERVIEW_NOTIFY_EMAIL = cleanEnv(process.env.INTERVIEW_NOTIFY_EMAIL || 'isaac.falcon.davila@gmail.com');

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use((req,res,next)=>{
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies','none');
  if(req.path === '/admin.html' || req.path.startsWith('/api/admin')){
    res.setHeader('Cache-Control','no-store, private, max-age=0');
    res.setHeader('Pragma','no-cache');
  }
  next();
});

app.use(express.json({limit:'1mb'}));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 7,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {error:'Demasiados intentos de inicio de sesión. Espera 15 minutos e intenta nuevamente.'}
});

const publicSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {error:'Se alcanzó el límite temporal de solicitudes desde esta conexión. Intenta más tarde.'}
});

const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {error:'Demasiadas consultas. Intenta nuevamente en unos minutos.'}
});

const adminApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 800,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {error:'Demasiadas operaciones administrativas. Intenta nuevamente en unos minutos.'}
});

function clientIp(req){
  return String(req.ip || req.socket?.remoteAddress || '').slice(0,120);
}

function safeAuditDetails(value){
  try{
    return JSON.stringify(value ?? {}).slice(0,1500);
  }catch{
    return '';
  }
}

function audit(req, adminId, action, targetType='', targetId='', details={}){
  try{
    db.prepare(`
      INSERT INTO audit_logs(admin_id,action,target_type,target_id,details,ip,user_agent)
      VALUES(?,?,?,?,?,?,?)
    `).run(
      adminId || null,
      String(action).slice(0,80),
      String(targetType).slice(0,50),
      String(targetId).slice(0,80),
      safeAuditDetails(details),
      clientIp(req),
      String(req.get('user-agent') || '').slice(0,300)
    );
  }catch(err){
    console.error('[AUDIT_ERROR]',err?.message || err);
  }
}

function sameOriginMutation(req,res,next){
  if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();

  const secFetchSite = String(req.get('sec-fetch-site') || '').toLowerCase();
  if(secFetchSite && !['same-origin','same-site','none'].includes(secFetchSite)){
    return res.status(403).json({error:'Solicitud bloqueada por seguridad.'});
  }

  const origin = req.get('origin');
  if(!origin) return next();

  try{
    const originHost = new URL(origin).host;
    const requestHost = String(req.get('host') || '');
    const publicHost = new URL(PUBLIC_URL).host;
    if(originHost === requestHost || originHost === publicHost) return next();
  }catch{}

  return res.status(403).json({error:'Origen no permitido.'});
}

app.use('/api/admin', adminApiLimiter, sameOriginMutation);
app.use('/logos', express.static(path.join(__dirname, 'logos')));
app.use('/assets', express.static(path.join(__dirname, 'assets'), {maxAge:'7d'}));

['index.html','prensa.html','fotografos.html','entrevistas.html','admin.html','estado.html','verificar.html','styles.css'].forEach(file=>{
  app.get('/'+file, (req,res)=>res.sendFile(path.join(__dirname,file)));
});
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));

function clean(v){ return String(v ?? '').trim(); }
function boundedText(v,max){
  const s=clean(v).replace(/\u0000/g,'');
  return s.length > max ? s.slice(0,max) : s;
}
function validEmail(v){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}
function validSignature(v){
  return typeof v === 'string'
    && v.length >= 50
    && v.length <= 500000
    && /^data:image\/png;base64,[A-Za-z0-9+/=\r\n]+$/.test(v);
}

function auth(req,res,next){
  const token = req.cookies.idv_admin;
  if(!token) return res.status(401).json({error:'No autorizado'});
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if(!payload?.jti) throw new Error('missing session');

    const session = db.prepare(`
      SELECT jti,admin_id,expires_at
      FROM admin_sessions
      WHERE jti=? AND admin_id=?
    `).get(payload.jti,payload.id);

    if(!session || new Date(session.expires_at).getTime() <= Date.now()){
      if(session) db.prepare('DELETE FROM admin_sessions WHERE jti=?').run(payload.jti);
      return res.status(401).json({error:'Sesión expirada'});
    }

    req.admin = payload;
    req.adminSession = session;
    next();
  } catch {
    return res.status(401).json({error:'Sesión inválida'});
  }
}
function publicCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='IDV-';
  for(let i=0;i<12;i++) s += chars[crypto.randomInt(0,chars.length)];
  return s;
}
function uniqueCode(){
  let c; do{ c=publicCode(); }while(db.prepare('SELECT 1 FROM requests WHERE public_code=?').get(c));
  return c;
}
function uniqueToken(){
  let t; do{ t=crypto.randomBytes(20).toString('hex'); }while(db.prepare('SELECT 1 FROM requests WHERE verify_token=?').get(t));
  return t;
}

function interviewPublicCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do{
    c='ENT-';
    for(let i=0;i<10;i++) c += chars[crypto.randomInt(0,chars.length)];
  }while(db.prepare('SELECT 1 FROM interview_requests WHERE public_code=?').get(c));
  return c;
}

function interviewModeLabel(value){
  return ({radial:'Radial',presencial:'Presencial',zoom:'Zoom'})[value] || value;
}

const INTERVIEW_MIN_NOTICE_HOURS = 72;
const INTERVIEW_APPROVAL_MESSAGE = 'Solicitud aprobada. Comunicate con el jefe de prensa Juan Gonzales y su numero +593 994476462';

function interviewRequestDateTimeUTC(day,time){
  const dm=String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm=String(time || '').match(/^(0?[1-9]|1[0-2]):([0-5]\d) (AM|PM)$/);
  if(!dm || !tm) return null;

  let hour=Number(tm[1]);
  const minute=Number(tm[2]);
  const period=tm[3];

  if(period==='AM' && hour===12) hour=0;
  if(period==='PM' && hour!==12) hour+=12;

  // Ecuador continental (Quito/Sangolquí) usa UTC-5 todo el año.
  // Para convertir una hora local EC a UTC se suman 5 horas.
  const utcMs=Date.UTC(
    Number(dm[1]),
    Number(dm[2])-1,
    Number(dm[3]),
    hour+5,
    minute,
    0,
    0
  );
  return new Date(utcMs);
}
function activeEvent(){
  // El evento público depende únicamente de que Administración lo deje en OPEN.
  // `datetime-local` no incluye zona horaria y Railway suele correr en UTC;
  // usar deadline para cerrar automáticamente podía ocultar el evento antes de tiempo.
  return db.prepare(`SELECT * FROM events WHERE status='open' ORDER BY event_date ASC LIMIT 1`).get();
}
function markPresent(requestId){
  db.prepare(`UPDATE requests SET attendance_status='present', attendance_at=COALESCE(attendance_at, CURRENT_TIMESTAMP) WHERE id=?`).run(requestId);
}
function csvEscape(v){
  let s = String(v ?? '');
  // Evita CSV/Excel formula injection cuando un dato del formulario inicia con = + - @
  if(/^[=+\-@]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function sendCsv(res, filename, header, rows){
  const sep=';';
  const csv = '\uFEFF' + 'sep=;' + '\r\n' + [header.join(sep), ...rows.map(row => row.map(csvEscape).join(sep))].join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

app.post('/api/admin/login',loginLimiter,(req,res)=>{
  const email=boundedText(req.body.email,254).toLowerCase();
  const password=String(req.body.password||'').slice(0,300);
  const a=db.prepare('SELECT * FROM admins WHERE email=?').get(email);

  if(!a || !bcrypt.compareSync(password,a.password_hash)){
    audit(req,a?.id || null,'LOGIN_FAILED','admin',a?.id || '',{email});
    return res.status(401).json({error:'Correo o contraseña incorrectos'});
  }

  // Limpieza de sesiones vencidas.
  db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(new Date().toISOString());

  const jti=crypto.randomBytes(32).toString('hex');
  const expiresAt=new Date(Date.now() + 8*60*60*1000).toISOString();

  db.prepare(`
    INSERT INTO admin_sessions(jti,admin_id,expires_at,ip,user_agent)
    VALUES(?,?,?,?,?)
  `).run(
    jti,
    a.id,
    expiresAt,
    clientIp(req),
    String(req.get('user-agent') || '').slice(0,300)
  );

  const token=jwt.sign(
    {id:a.id,email:a.email,jti},
    JWT_SECRET,
    {expiresIn:'8h',issuer:'idv-acreditaciones',audience:'idv-admin'}
  );

  res.cookie('idv_admin',token,{
    httpOnly:true,
    sameSite:'strict',
    secure:IS_PRODUCTION,
    path:'/',
    maxAge:8*60*60*1000
  });

  audit(req,a.id,'LOGIN_SUCCESS','admin',a.id);
  res.json({ok:true});
});

app.post('/api/admin/logout',(req,res)=>{
  const token=req.cookies.idv_admin;
  if(token){
    try{
      const payload=jwt.verify(token,JWT_SECRET);
      if(payload?.jti) db.prepare('DELETE FROM admin_sessions WHERE jti=?').run(payload.jti);
      audit(req,payload?.id || null,'LOGOUT','admin',payload?.id || '');
    }catch{}
  }
  res.clearCookie('idv_admin',{
    httpOnly:true,
    sameSite:'strict',
    secure:IS_PRODUCTION,
    path:'/'
  });
  res.json({ok:true});
});

app.get('/api/admin/me',auth,(req,res)=>res.json({
  admin:{id:req.admin.id,email:req.admin.email}
}));

app.get('/api/admin/audit',auth,(req,res)=>{
  const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);
  const rows=db.prepare(`
    SELECT id,admin_id,action,target_type,target_id,details,ip,user_agent,created_at
    FROM audit_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.get('/api/public/event',(req,res)=>{
  // Nunca cachear este endpoint: el estado OPEN/CLOSED cambia desde Administración.
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Expires','0');

  const e=activeEvent();
  if(!e){
    return res.json({
      event:null,
      version:'7.2.2',
      serverTime:new Date().toISOString()
    });
  }

  res.json({
    event:e,
    version:'7.2.2',
    serverTime:new Date().toISOString()
  });
});

app.post('/api/public/requests',publicSubmitLimiter,(req,res)=>{
  const event=activeEvent();
  if(!event) return res.status(409).json({error:'Las acreditaciones no están abiertas en este momento.'});
  const category=clean(req.body.category);
  if(!['press','photo'].includes(category)){
    return res.status(400).json({error:'Tipo de acreditación inválido.'});
  }

  const requestedAccreditationType=clean(req.body.accreditationType);
  const allowedMediaTypes=['medio_digital','prensa_escrita','radio','tv','camarografo'];
  const accreditationType = category==='photo' ? 'fotografo' : requestedAccreditationType;

  if(category==='press' && !allowedMediaTypes.includes(accreditationType)){
    return res.status(400).json({error:'Selecciona un tipo de acreditación válido.'});
  }

  const data={
    firstName:boundedText(req.body.firstName,80),
    lastName:boundedText(req.body.lastName,80),
    document:boundedText(req.body.document,40),
    nationality:boundedText(req.body.nationality,100),
    mediaName:boundedText(req.body.mediaName,120),
    roleTitle:boundedText(req.body.roleTitle,120),
    coverage:boundedText(req.body.coverage,120),
    email:boundedText(req.body.email,254).toLowerCase(),
    phone:boundedText(req.body.phone,30),
    notes:boundedText(req.body.notes,500)
  };

  if([data.firstName,data.lastName,data.document,data.nationality,data.mediaName,data.roleTitle,data.coverage,data.email,data.phone].some(v=>!v)){
    return res.status(400).json({error:'Completa todos los campos obligatorios.'});
  }
  if(!validEmail(data.email)){
    return res.status(400).json({error:'El correo electrónico no es válido.'});
  }
  if(data.nationality.length < 2 || data.nationality.length > 100){
    return res.status(400).json({error:'Selecciona una nacionalidad válida.'});
  }
  if(!/^[A-Za-z0-9.\-]{5,40}$/.test(data.document)){
    return res.status(400).json({error:'El documento contiene caracteres no permitidos.'});
  }
  const code=uniqueCode();
  try{
    db.prepare(`INSERT INTO requests (
      event_id,public_code,category,accreditation_type,first_name,last_name,document,nationality,
      media_name,role_title,coverage,email,phone,notes
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        event.id,code,category,accreditationType,data.firstName,data.lastName,data.document,data.nationality,
        data.mediaName,data.roleTitle,data.coverage,data.email,data.phone,data.notes
      );
    res.json({ok:true, publicCode:code, statusUrl:`${PUBLIC_URL}/estado.html?codigo=${encodeURIComponent(code)}`});
  }catch(e){
    if(String(e.message).includes('UNIQUE')) return res.status(409).json({error:'Ya existe una solicitud con este documento para este partido.'});
    console.error(e); res.status(500).json({error:'No se pudo guardar la solicitud.'});
  }
});

app.get('/api/public/status/:code',publicLookupLimiter,(req,res)=>{
  const r=db.prepare(`SELECT r.public_code,r.category,r.accreditation_type,r.first_name,r.last_name,r.nationality,r.media_name,r.role_title,r.status,r.assignment,r.admin_notes,r.submitted_at,r.attendance_status,r.attendance_at,e.title,e.event_date,e.venue,r.verify_token FROM requests r JOIN events e ON e.id=r.event_id WHERE r.public_code=?`).get(req.params.code);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  res.json({
    ...r,
    qrUrl: r.verify_token && ['approved','delivered'].includes(r.status) ? `/api/public/qr/${r.verify_token}` : null,
    verifyUrl: r.verify_token ? `${PUBLIC_URL}/verificar.html?t=${r.verify_token}` : null
  });
});

app.get('/api/public/qr/:token',publicLookupLimiter,async(req,res)=>{
  const r=db.prepare(`SELECT verify_token,status FROM requests WHERE verify_token=?`).get(req.params.token);
  if(!r || !['approved','delivered'].includes(r.status)) return res.status(404).end();
  res.type('png');
  await QRCode.toFileStream(res, `${PUBLIC_URL}/verificar.html?t=${r.verify_token}`, {width:500,margin:2,errorCorrectionLevel:'M'});
});

app.get('/api/public/verify/:token',publicLookupLimiter,(req,res)=>{
  const r=db.prepare(`SELECT r.id,r.public_code,r.category,r.accreditation_type,r.first_name,r.last_name,r.nationality,r.media_name,r.role_title,r.status,r.assignment,r.attendance_status,r.attendance_at,e.id event_id,e.title,e.event_date,e.venue FROM requests r JOIN events e ON e.id=r.event_id WHERE r.verify_token=?`).get(req.params.token);
  if(!r) return res.status(404).json({error:'Acreditación no encontrada'});
  const vest = r.category==='photo' ? db.prepare(`SELECT vest_number,credential_retained,checkout_at,returned_at,status FROM vest_loans WHERE request_id=?`).get(r.id) : null;
  res.json({...r, vest});
});


app.post('/api/public/interviews',publicSubmitLimiter,async(req,res)=>{
  const data={
    interviewee:boundedText(req.body.interviewee,120),
    topics:boundedText(req.body.topics,1200),
    mediaName:boundedText(req.body.mediaName,140),
    programName:boundedText(req.body.programName,140),
    journalists:boundedText(req.body.journalists,240),
    requestedDay:boundedText(req.body.requestedDay,20),
    requestedTime:boundedText(req.body.requestedTime,20),
    maxDuration:Number(req.body.maxDuration),
    interviewMode:clean(req.body.interviewMode),
    email:boundedText(req.body.email,254).toLowerCase(),
    phone:boundedText(req.body.phone,40),
    notes:boundedText(req.body.notes,800)
  };

  if([
    data.interviewee,data.topics,data.mediaName,data.programName,data.journalists,
    data.requestedDay,data.requestedTime,data.interviewMode,data.email,data.phone
  ].some(v=>!v) || !Number.isFinite(data.maxDuration) || data.maxDuration < 1 || data.maxDuration > 180){
    return res.status(400).json({error:'Completa correctamente todos los campos obligatorios.'});
  }

  if(!['radial','presencial','zoom'].includes(data.interviewMode)){
    return res.status(400).json({error:'Selecciona una vía de entrevista válida.'});
  }
  if(!validEmail(data.email)){
    return res.status(400).json({error:'El correo electrónico no es válido.'});
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.requestedDay)){
    return res.status(400).json({error:'La fecha solicitada no es válida.'});
  }
  if(!/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(data.requestedTime)){
    return res.status(400).json({error:'El horario solicitado no es válido.'});
  }

  const requestedAt=interviewRequestDateTimeUTC(data.requestedDay,data.requestedTime);
  if(!requestedAt || Number.isNaN(requestedAt.getTime())){
    return res.status(400).json({error:'La fecha y hora solicitadas no son válidas.'});
  }

  const minAllowed=Date.now() + INTERVIEW_MIN_NOTICE_HOURS*60*60*1000;
  if(requestedAt.getTime() < minAllowed){
    return res.status(400).json({
      error:'Las solicitudes de entrevista deben realizarse con un mínimo de 72 horas de anticipación.'
    });
  }

  const code=interviewPublicCode();
  const result=db.prepare(`
    INSERT INTO interview_requests(
      public_code,interviewee,topics,media_name,program_name,journalists,
      requested_day,requested_time,max_duration,interview_mode,email,phone,notes
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    code,data.interviewee,data.topics,data.mediaName,data.programName,data.journalists,
    data.requestedDay,data.requestedTime,data.maxDuration,data.interviewMode,
    data.email,data.phone,data.notes
  );

  const row=db.prepare('SELECT * FROM interview_requests WHERE id=?').get(result.lastInsertRowid);
  let emailSent=null;
  let emailWarning=null;

  try{
    const mail=await sendInterviewNotificationEmail(row);
    emailSent=mail.sent;
    emailWarning=mail.warning || null;
  }catch(err){
    console.error('[INTERVIEW_NOTIFICATION_ERROR]',err);
    emailSent=false;
    emailWarning='La solicitud fue registrada, pero la notificación interna por correo no pudo enviarse.';
  }

  res.json({
    ok:true,
    code,
    emailSent,
    emailWarning,
    message:'Solicitud de entrevista enviada correctamente.'
  });
});

app.get('/api/admin/interviews',auth,(req,res)=>{
  const status=clean(req.query.status);
  let sql='SELECT * FROM interview_requests WHERE 1=1';
  const params=[];
  if(status){
    if(!['pending','approved','rejected'].includes(status)){
      return res.status(400).json({error:'Estado inválido'});
    }
    sql+=' AND status=?';
    params.push(status);
  }
  sql+=' ORDER BY submitted_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/admin/interviews/:id',auth,async(req,res)=>{
  const id=Number(req.params.id);
  const current=db.prepare('SELECT * FROM interview_requests WHERE id=?').get(id);
  if(!current) return res.status(404).json({error:'Solicitud de entrevista no encontrada'});

  const status=clean(req.body.status || current.status);
  if(!['pending','approved','rejected'].includes(status)){
    return res.status(400).json({error:'Estado inválido'});
  }

  let adminNotes=boundedText(req.body.adminNotes ?? current.admin_notes,1000);
  if(status==='approved'){
    adminNotes=INTERVIEW_APPROVAL_MESSAGE;
  }
  const changedDecision=['approved','rejected'].includes(status) && status!==current.status;
  const reviewedAt=['approved','rejected'].includes(status) ? new Date().toISOString() : current.reviewed_at;

  db.prepare(`
    UPDATE interview_requests
    SET status=?,admin_notes=?,reviewed_at=?
    WHERE id=?
  `).run(status,adminNotes,reviewedAt,id);

  const updated=db.prepare('SELECT * FROM interview_requests WHERE id=?').get(id);
  let emailSent=null;
  let emailWarning=null;

  if(changedDecision){
    try{
      const mail=await sendInterviewDecisionEmail(updated);
      emailSent=mail.sent;
      emailWarning=mail.warning || null;
    }catch(err){
      console.error('[INTERVIEW_DECISION_EMAIL_ERROR]',err);
      emailSent=false;
      emailWarning='La decisión se guardó, pero el correo al periodista no pudo enviarse.';
    }
  }

  audit(req,req.admin.id,'INTERVIEW_UPDATED','interview',id,{
    fromStatus:current.status,
    toStatus:status,
    emailSent
  });

  res.json({ok:true,emailSent,emailWarning});
});

app.delete('/api/admin/interviews/:id',auth,(req,res)=>{
  const id=Number(req.params.id);
  const current=db.prepare('SELECT public_code,status,media_name,interviewee FROM interview_requests WHERE id=?').get(id);
  if(!current) return res.status(404).json({error:'Solicitud de entrevista no encontrada'});

  db.prepare('DELETE FROM interview_requests WHERE id=?').run(id);
  audit(req,req.admin.id,'INTERVIEW_DELETED','interview',id,current);
  res.json({ok:true});
});

app.get('/api/admin/events',auth,(req,res)=>{
  const rows=db.prepare(`SELECT e.*,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id) total_requests,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id AND r.status='pending') pending_requests,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id AND r.status IN ('approved','delivered')) approved_requests,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id AND r.attendance_status='present') present_requests
    FROM events e ORDER BY event_date DESC`).all();
  res.json(rows);
});

app.post('/api/admin/events',auth,(req,res)=>{
  const title=boundedText(req.body.title,140);
  const opponent=boundedText(req.body.opponent,120);
  const eventDate=clean(req.body.eventDate);
  const venue=boundedText(req.body.venue,160);
  const deadline=clean(req.body.deadline);
  const competition=detectCompetition(title, clean(req.body.competition || 'auto'));

  if(!title || !eventDate) return res.status(400).json({error:'Título y fecha son obligatorios.'});

  const result=db.prepare(`
    INSERT INTO events(title,opponent,event_date,venue,deadline,competition,status)
    VALUES(?,?,?,?,?,?,'draft')
  `).run(title,opponent,eventDate,venue,deadline,competition);

  audit(req,req.admin.id,'EVENT_CREATED','event',result.lastInsertRowid,{
    title,eventDate,venue,competition
  });
  res.json({ok:true,id:result.lastInsertRowid,competition});
});

app.patch('/api/admin/events/:id',auth,(req,res)=>{
  const id=Number(req.params.id); const e=db.prepare('SELECT * FROM events WHERE id=?').get(id);
  if(!e) return res.status(404).json({error:'Evento no encontrado'});
  const status=req.body.status ?? e.status;
  if(!['draft','open','closed','archived'].includes(status)) return res.status(400).json({error:'Estado inválido'});
  if(status==='open') db.prepare(`UPDATE events SET status='closed' WHERE status='open' AND id<>?`).run(id);
  const nextTitle=boundedText(req.body.title ?? e.title,140);
  const nextCompetition=detectCompetition(
    nextTitle,
    req.body.competition !== undefined ? clean(req.body.competition) : (e.competition || 'other')
  );

  db.prepare(`UPDATE events SET title=?,opponent=?,event_date=?,venue=?,deadline=?,competition=?,status=? WHERE id=?`)
    .run(
      nextTitle,
      boundedText(req.body.opponent ?? e.opponent,120),
      clean(req.body.eventDate ?? e.event_date),
      boundedText(req.body.venue ?? e.venue,160),
      clean(req.body.deadline ?? e.deadline),
      nextCompetition,
      status,
      id
    );

  audit(req,req.admin.id,'EVENT_UPDATED','event',id,{
    fromStatus:e.status,
    toStatus:status,
    competition:nextCompetition
  });
  res.json({ok:true});
});

app.get('/api/admin/requests',auth,(req,res)=>{
  const eventId=Number(req.query.eventId||0); const status=clean(req.query.status); const attendance=clean(req.query.attendance);
  let sql=`SELECT r.*,e.title event_title FROM requests r JOIN events e ON e.id=r.event_id WHERE e.status<>'archived'`; const params=[];
  if(eventId){ sql+=' AND r.event_id=?'; params.push(eventId); }
  if(status){ sql+=' AND r.status=?'; params.push(status); }
  if(attendance){ sql+=' AND r.attendance_status=?'; params.push(attendance); }
  sql+=' ORDER BY r.submitted_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/admin/requests/:id',auth,async(req,res)=>{
  const id=Number(req.params.id);
  const r=db.prepare(`
    SELECT r.*, e.title AS event_title, e.event_date, e.venue, e.competition
    FROM requests r
    JOIN events e ON e.id=r.event_id
    WHERE r.id=?
  `).get(id);

  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});

  const status=req.body.status ?? r.status;
  if(!['pending','approved','rejected','delivered'].includes(status)){
    return res.status(400).json({error:'Estado inválido'});
  }

  const becameApproved = status==='approved' && r.status!=='approved';

  let token=r.verify_token;
  if(status==='approved' && !token) token=uniqueToken();
  if(status==='rejected') token=null;

  const assignment=clean(req.body.assignment ?? r.assignment);
  const adminNotes=clean(req.body.adminNotes ?? r.admin_notes);

  let attendanceStatus=clean(req.body.attendanceStatus || r.attendance_status || 'absent');
  if(!['present','absent'].includes(attendanceStatus)){
    attendanceStatus=r.attendance_status || 'absent';
  }

  let attendanceAt=r.attendance_at;
  if(status==='delivered' && attendanceStatus!=='present'){
    attendanceStatus='present';
    attendanceAt=attendanceAt || new Date().toISOString();
  }
  if(req.body.attendanceStatus==='present'){
    attendanceAt=attendanceAt || new Date().toISOString();
  }
  if(req.body.attendanceStatus==='absent'){
    attendanceAt=null;
  }

  const reviewedAt=['approved','rejected','delivered'].includes(status)
    ? new Date().toISOString()
    : r.reviewed_at;

  const deliveredAt=status==='delivered'
    ? new Date().toISOString()
    : (status==='approved' ? null : r.delivered_at);

  db.prepare(`
    UPDATE requests
    SET status=?,assignment=?,admin_notes=?,verify_token=?,reviewed_at=?,
        delivered_at=?,attendance_status=?,attendance_at=?
    WHERE id=?
  `).run(
    status,assignment,adminNotes,token,reviewedAt,
    deliveredAt,attendanceStatus,attendanceAt,id
  );

  let emailSent=null;
  let emailWarning=null;

  if(becameApproved){
    try{
      const updated={
        ...r,
        status,
        assignment,
        verify_token:token
      };
      const result=await sendApprovalEmail(updated);
      emailSent=result.sent;
      emailWarning=result.warning || null;
    }catch(err){
      console.error('[APPROVAL_EMAIL_ERROR]',err);
      emailSent=false;
      emailWarning=`La acreditación se aprobó, pero el correo no pudo enviarse: ${String(err && err.message ? err.message : err)}`;
    }
  }

  audit(req,req.admin.id,'REQUEST_UPDATED','request',id,{
    fromStatus:r.status,
    toStatus:status,
    attendanceStatus,
    emailSent
  });

  res.json({
    ok:true,
    emailSent,
    emailWarning
  });
});

app.post('/api/admin/attendance/:requestId',auth,(req,res)=>{
  const requestId=Number(req.params.requestId);
  const r=db.prepare(`SELECT id,status FROM requests WHERE id=?`).get(requestId);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  if(!['approved','delivered'].includes(r.status)) return res.status(409).json({error:'Solo se puede marcar asistencia a solicitudes aprobadas o entregadas.'});
  markPresent(requestId);
  audit(req,req.admin.id,'ATTENDANCE_MARKED','request',requestId);
  res.json({ok:true});
});

app.delete('/api/admin/requests/:id',auth,(req,res)=>{
  const id=Number(req.params.id);
  const existing=db.prepare('SELECT public_code,event_id,status FROM requests WHERE id=?').get(id);
  if(!existing) return res.status(404).json({error:'Solicitud no encontrada'});
  db.prepare('DELETE FROM requests WHERE id=?').run(id);
  audit(req,req.admin.id,'REQUEST_DELETED','request',id,existing);
  res.json({ok:true});
});

app.get('/api/admin/scan/:token',auth,(req,res)=>{
  const r=db.prepare(`SELECT r.*,e.title event_title,e.event_date,e.venue FROM requests r JOIN events e ON e.id=r.event_id WHERE r.verify_token=?`).get(req.params.token);
  if(!r) return res.status(404).json({error:'Acreditación no encontrada'});
  const vest=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(r.id) || null;
  res.json({request:r, vest});
});

app.post('/api/admin/vests/checkout/:requestId',auth,(req,res)=>{
  const requestId=Number(req.params.requestId); const r=db.prepare(`SELECT * FROM requests WHERE id=?`).get(requestId);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  if(r.category!=='photo') return res.status(400).json({error:'El control de chaleco solo aplica a fotógrafos.'});
  if(!['approved','delivered'].includes(r.status)) return res.status(409).json({error:'El fotógrafo debe estar aprobado antes de entregar un chaleco.'});
  const vestNumber=boundedText(req.body.vestNumber,20); const signature=clean(req.body.signature); const retained=req.body.credentialRetained ? 1 : 0;
  if(!vestNumber) return res.status(400).json({error:'Ingresa el número de chaleco.'});
  if(!validSignature(signature)) return res.status(400).json({error:'La firma de recepción no es válida.'});
  const existing=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(requestId);
  if(existing && existing.status==='out') return res.status(409).json({error:`Este fotógrafo ya tiene el chaleco ${existing.vest_number}.`});
  if(existing && existing.status==='returned') return res.status(409).json({error:'Este fotógrafo ya completó un ciclo de chaleco para este evento.'});
  const busy=db.prepare(`SELECT vl.*,r.first_name,r.last_name FROM vest_loans vl JOIN requests r ON r.id=vl.request_id WHERE vl.event_id=? AND vl.vest_number=? AND vl.status='out'`).get(r.event_id,vestNumber);
  if(busy) return res.status(409).json({error:`El chaleco ${vestNumber} ya está en uso por ${busy.first_name} ${busy.last_name}.`});
  db.prepare(`INSERT INTO vest_loans(event_id,request_id,vest_number,credential_retained,checkout_signature,status) VALUES(?,?,?,?,?,'out')`).run(r.event_id,requestId,vestNumber,retained,signature);
  markPresent(requestId);
  audit(req,req.admin.id,'VEST_CHECKOUT','request',requestId,{vestNumber,credentialRetained:!!retained});
  res.json({ok:true});
});

app.post('/api/admin/vests/return/:requestId',auth,(req,res)=>{
  const requestId=Number(req.params.requestId); const loan=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(requestId);
  if(!loan) return res.status(404).json({error:'No hay un chaleco registrado para este fotógrafo.'});
  if(loan.status==='returned') return res.status(409).json({error:'Este chaleco ya fue registrado como devuelto.'});
  const vestNumber=boundedText(req.body.vestNumber,20); const signature=clean(req.body.signature);
  if(vestNumber!==loan.vest_number) return res.status(409).json({error:`El chaleco asignado es el N.º ${loan.vest_number}. Verifica el número antes de continuar.`});
  if(!validSignature(signature)) return res.status(400).json({error:'La firma de devolución no es válida.'});
  db.prepare(`UPDATE vest_loans SET status='returned',return_signature=?,returned_at=CURRENT_TIMESTAMP WHERE id=?`).run(signature,loan.id);
  audit(req,req.admin.id,'VEST_RETURN','request',requestId,{vestNumber});
  res.json({ok:true,credentialRetained:!!loan.credential_retained});
});

app.get('/api/admin/vests',auth,(req,res)=>{
  try{
    const eventIdRaw=clean(req.query.eventId); const eventId=eventIdRaw ? Number(eventIdRaw) : 0;
    if(eventIdRaw && (!Number.isInteger(eventId) || eventId <= 0)) return res.status(400).json({ok:false,error:'El evento seleccionado no es válido.',received:eventIdRaw});
    const allCount=db.prepare('SELECT COUNT(*) AS c FROM vest_loans').get().c;
    const eventCount=eventId ? db.prepare('SELECT COUNT(*) AS c FROM vest_loans WHERE event_id=?').get(eventId).c : allCount;
    let sql=`SELECT vl.id,vl.event_id,vl.request_id,vl.vest_number,vl.credential_retained,vl.checkout_signature,vl.checkout_at,vl.return_signature,vl.returned_at,vl.status,r.first_name,r.last_name,r.media_name,r.public_code,r.document,r.role_title,e.title AS event_title FROM vest_loans vl INNER JOIN requests r ON r.id=vl.request_id INNER JOIN events e ON e.id=vl.event_id`;
    const params=[];
    if(eventId){ sql+=' WHERE vl.event_id=?'; params.push(eventId); }
    sql += ` ORDER BY CASE WHEN vl.status='out' THEN 0 ELSE 1 END, vl.checkout_at DESC, CAST(vl.vest_number AS INTEGER), vl.vest_number`;
    const rows=db.prepare(sql).all(...params);
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({ok:true,eventId:eventId||null,totalAll:allCount,totalForEvent:eventCount,serverTime:new Date().toISOString(),rows});
  }catch(err){
    console.error('[VESTS_GET_ERROR]',err);
    res.status(500).json({ok:false,error:'No se pudo consultar el control de chalecos.',detail:String(err?.message || err)});
  }
});

app.get('/api/admin/events/:id/security.csv',auth,(req,res)=>{
  const eventId=Number(req.params.id); const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if(!event) return res.status(404).json({error:'Evento no encontrado'});
  const rows=db.prepare(`SELECT category,accreditation_type,first_name,last_name,document,nationality,media_name,role_title,assignment,status,attendance_status FROM requests WHERE event_id=? AND status IN ('approved','delivered') ORDER BY LOWER(media_name), category, LOWER(last_name), LOWER(first_name)`).all(eventId);
  sendCsv(res, `seguridad-${eventId}.csv`, ['Tipo','Nombres','Apellidos','Documento','Nacionalidad','Medio','Función','Restricción','Asignación','Estado','Asistencia'], rows.map(r=>[
    accreditationTypeLabel(r.accreditation_type,r.category), r.first_name, r.last_name, r.document, r.nationality||'',
    r.media_name, r.role_title, accreditationRestriction(r.accreditation_type), r.assignment||'',
    r.status, r.attendance_status==='present'?'Presente':'No registrado'
  ]));
});

app.get('/api/admin/events/:id/attendance.csv',auth,(req,res)=>{
  const eventId=Number(req.params.id); const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if(!event) return res.status(404).json({error:'Evento no encontrado'});
  const rows=db.prepare(`SELECT category,accreditation_type,first_name,last_name,document,nationality,media_name,role_title,assignment,status,attendance_status,attendance_at FROM requests WHERE event_id=? AND status IN ('approved','delivered') ORDER BY LOWER(media_name), category, LOWER(last_name), LOWER(first_name)`).all(eventId);
  sendCsv(res, `asistencia-${eventId}.csv`, ['Tipo','Nombres','Apellidos','Documento','Nacionalidad','Medio','Función','Restricción','Asignación','Estado credencial','Asistencia','Fecha asistencia'], rows.map(r=>[
    accreditationTypeLabel(r.accreditation_type,r.category), r.first_name, r.last_name, r.document, r.nationality||'',
    r.media_name, r.role_title, accreditationRestriction(r.accreditation_type), r.assignment||'',
    r.status, r.attendance_status==='present'?'Presente':'No registrado', r.attendance_at||''
  ]));
});


function formatDateEC(value){
  if(!value) return '';
  try{
    const raw=String(value);
    const d=new Date(raw.includes('T') ? raw : raw.replace(' ','T')+'Z');
    if(Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat('es-EC',{
      timeZone:'America/Guayaquil',
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hour12:false
    }).format(d);
  }catch{
    return String(value ?? '');
  }
}

function excelSafeFilename(text,fallback){
  const s=String(text||fallback||'reporte')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,70);
  return s || fallback || 'reporte';
}

function addIdvSheet(workbook,{name,title,subtitle,rows,columns,summary=[]}){
  const ws=workbook.addWorksheet(name,{
    views:[{state:'frozen',ySplit:6}]
  });

  const colCount=columns.length;
  const lastCol=String.fromCharCode(64+colCount);

  // Encabezado institucional.
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').value=title;
  ws.getCell('A1').font={name:'Aptos Display',size:18,bold:true,color:{argb:'FFFFFFFF'}};
  ws.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF07111F'}};
  ws.getCell('A1').alignment={vertical:'middle',horizontal:'left'};
  ws.getRow(1).height=30;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').value=subtitle;
  ws.getCell('A2').font={name:'Aptos',size:11,color:{argb:'FFB8C8E8'}};
  ws.getCell('A2').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF07111F'}};
  ws.getCell('A2').alignment={vertical:'middle',horizontal:'left'};
  ws.getRow(2).height=22;

  // Resumen.
  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell('A3').value=summary.filter(Boolean).join('    •    ');
  ws.getCell('A3').font={name:'Aptos',size:10,bold:true,color:{argb:'FF0B1A33'}};
  ws.getCell('A3').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFDCE8FF'}};
  ws.getCell('A3').alignment={vertical:'middle',horizontal:'left'};
  ws.getRow(3).height=22;

  // Espacio.
  ws.getRow(4).height=8;

  // Cabecera tabla.
  const headerRow=ws.getRow(5);
  headerRow.values=columns.map(c=>c.header);
  headerRow.font={name:'Aptos',size:10,bold:true,color:{argb:'FFFFFFFF'}};
  headerRow.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E5FD7'}};
  headerRow.alignment={vertical:'middle',horizontal:'center',wrapText:true};
  headerRow.height=30;

  // Datos.
  for(const data of rows){
    const values=columns.map(c=>data[c.key] ?? '');
    const row=ws.addRow(values);
    row.font={name:'Aptos',size:10,color:{argb:'FF111827'}};
    row.alignment={vertical:'top',wrapText:true};
    row.height=24;
  }

  // Column widths + formats.
  columns.forEach((c,idx)=>{
    const col=ws.getColumn(idx+1);
    col.width=c.width || 18;
    if(c.text){
      for(let r=6;r<=ws.rowCount;r++) ws.getCell(r,idx+1).numFmt='@';
    }
  });

  // Row banding, borders and alignment.
  for(let r=6;r<=ws.rowCount;r++){
    const row=ws.getRow(r);
    row.eachCell({includeEmpty:true},cell=>{
      cell.border={
        bottom:{style:'thin',color:{argb:'FFD7DEEA'}},
        left:{style:'hair',color:{argb:'FFF0F3F8'}},
        right:{style:'hair',color:{argb:'FFF0F3F8'}}
      };
      if(r%2===0){
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF5F8FD'}};
      }
    });
  }

  // Estado / asistencia con formato visual.
  const statusIndex=columns.findIndex(c=>c.key==='statusLabel')+1;
  const attendanceIndex=columns.findIndex(c=>c.key==='attendanceLabel')+1;
  for(let r=6;r<=ws.rowCount;r++){
    if(statusIndex>0){
      const cell=ws.getCell(r,statusIndex);
      cell.font={name:'Aptos',size:10,bold:true,color:{argb:'FF1849A9'}};
      cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};
    }
    if(attendanceIndex>0){
      const cell=ws.getCell(r,attendanceIndex);
      const present=String(cell.value)==='Presente';
      cell.font={
        name:'Aptos',size:10,bold:true,
        color:{argb:present?'FF147A4B':'FF6B7280'}
      };
      cell.alignment={vertical:'middle',horizontal:'center'};
    }
  }

  if(ws.rowCount>=6){
    ws.autoFilter={from:'A5',to:`${lastCol}${ws.rowCount}`};
  }

  ws.pageSetup={
    orientation:'landscape',
    fitToPage:true,
    fitToWidth:1,
    fitToHeight:0,
    margins:{left:0.25,right:0.25,top:0.5,bottom:0.5,header:0.2,footer:0.2}
  };

  ws.headerFooter.oddFooter='&LIndependiente del Valle&CListado de acreditaciones&RPage &P de &N';
  return ws;
}

async function sendSecurityWorkbook(req,res,mode){
  try{
    const eventId=Number(req.params.id);
    const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
    if(!event) return res.status(404).json({error:'Evento no encontrado'});

    const rows=db.prepare(`
      SELECT category,accreditation_type,first_name,last_name,document,nationality,media_name,role_title,
             assignment,status,attendance_status,attendance_at
      FROM requests
      WHERE event_id=? AND status IN ('approved','delivered')
      ORDER BY LOWER(media_name), category, LOWER(last_name), LOWER(first_name)
    `).all(eventId);

    const normalized=rows.map(r=>({
      group:r.category,
      type:accreditationTypeLabel(r.accreditation_type,r.category),
      restriction:accreditationRestriction(r.accreditation_type),
      firstName:r.first_name,
      lastName:r.last_name,
      document:String(r.document ?? ''),
      nationality:r.nationality || '',
      media:r.media_name,
      role:r.role_title,
      assignment:r.assignment || 'Por asignar',
      statusLabel:r.status==='delivered'?'Credencial entregada':'Aprobado',
      attendanceLabel:r.attendance_status==='present'?'Presente':'No registrado',
      attendanceAt:r.attendance_status==='present' ? formatDateEC(r.attendance_at) : ''
    })).sort((a,b)=>{
      const byMedia=a.media.localeCompare(b.media,'es',{sensitivity:'base'});
      if(byMedia!==0) return byMedia;
      const byType=a.type.localeCompare(b.type,'es',{sensitivity:'base'});
      if(byType!==0) return byType;
      const byLast=a.lastName.localeCompare(b.lastName,'es',{sensitivity:'base'});
      if(byLast!==0) return byLast;
      return a.firstName.localeCompare(b.firstName,'es',{sensitivity:'base'});
    });

    const workbook=new ExcelJS.Workbook();
    workbook.creator='Independiente del Valle';
    workbook.company='Independiente del Valle';
    workbook.subject='Acreditaciones de prensa';
    workbook.title=`${mode==='attendance'?'Asistencia':'Listado de seguridad'} · ${event.title}`;
    workbook.created=new Date();

    const baseColumns=[
      {header:'TIPO',key:'type',width:18},
      {header:'NOMBRES',key:'firstName',width:22},
      {header:'APELLIDOS',key:'lastName',width:24},
      {header:'DOCUMENTO',key:'document',width:18,text:true},
      {header:'NACIONALIDAD',key:'nationality',width:22},
      {header:'MEDIO',key:'media',width:28},
      {header:'FUNCIÓN',key:'role',width:30},
      {header:'RESTRICCIÓN',key:'restriction',width:28},
      {header:'ASIGNACIÓN',key:'assignment',width:22},
      {header:'ESTADO DE CREDENCIAL',key:'statusLabel',width:23},
      {header:'ASISTENCIA',key:'attendanceLabel',width:18}
    ];
    const attendanceColumns=[
      ...baseColumns,
      {header:'FECHA / HORA DE ASISTENCIA',key:'attendanceAt',width:25}
    ];

    const eventMeta=[
      event.event_date ? `Partido: ${formatDateEC(event.event_date)}` : '',
      event.venue ? `Sede: ${event.venue}` : ''
    ].filter(Boolean).join('  |  ');

    const total=normalized.length;
    const present=normalized.filter(r=>r.attendanceLabel==='Presente').length;
    const absent=total-present;
    const press=normalized.filter(r=>r.group==='press').length;
    const photo=normalized.filter(r=>r.group==='photo').length;

    if(mode==='attendance'){
      addIdvSheet(workbook,{
        name:'Asistencia',
        title:`ASISTENCIA · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized,
        columns:attendanceColumns,
        summary:[`Acreditados: ${total}`,`Presentes: ${present}`,`No registrados: ${absent}`]
      });
      addIdvSheet(workbook,{
        name:'Presentes',
        title:`PRESENTES · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized.filter(r=>r.attendanceLabel==='Presente'),
        columns:attendanceColumns,
        summary:[`Presentes: ${present}`]
      });
      addIdvSheet(workbook,{
        name:'No asistieron',
        title:`SIN ASISTENCIA REGISTRADA · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized.filter(r=>r.attendanceLabel!=='Presente'),
        columns:attendanceColumns,
        summary:[`Sin registro: ${absent}`]
      });
    }else{
      addIdvSheet(workbook,{
        name:'Listado general',
        title:`LISTADO DE SEGURIDAD · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized,
        columns:baseColumns,
        summary:[`Acreditados: ${total}`,`Medios de comunicación: ${press}`,`Fotógrafos: ${photo}`,`Presentes: ${present}`]
      });
      addIdvSheet(workbook,{
        name:'Medios',
        title:`MEDIOS DE COMUNICACIÓN · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized.filter(r=>r.group==='press'),
        columns:baseColumns,
        summary:[`Medios acreditados: ${press}`]
      });
      addIdvSheet(workbook,{
        name:'Fotógrafos',
        title:`FOTÓGRAFOS · ${event.title}`,
        subtitle:eventMeta,
        rows:normalized.filter(r=>r.group==='photo'),
        columns:baseColumns,
        summary:[`Fotógrafos acreditados: ${photo}`]
      });
    }

    const buffer=await workbook.xlsx.writeBuffer();
    const safe=excelSafeFilename(event.title,`evento-${eventId}`);
    const prefix=mode==='attendance'?'asistencia':'seguridad';

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="${prefix}-${safe}.xlsx"`);
    res.setHeader('Content-Length',Buffer.byteLength(buffer));
    res.setHeader('Cache-Control','no-store');
    res.send(Buffer.from(buffer));
  }catch(err){
    console.error('[XLSX_EXPORT_ERROR]',err);
    res.status(500).json({
      error:'No se pudo generar el archivo Excel.',
      detail:String(err && err.message ? err.message : err)
    });
  }
}

app.get('/api/admin/events/:id/security.xlsx',auth,(req,res)=>sendSecurityWorkbook(req,res,'security'));
app.get('/api/admin/events/:id/attendance.xlsx',auth,(req,res)=>sendSecurityWorkbook(req,res,'attendance'));


app.use('/api',(err,req,res,next)=>{
  console.error('[API_ERROR]',req.method,req.originalUrl,err);
  if(res.headersSent) return next(err);
  res.status(500).json({ok:false,error:'Error interno del servidor.',detail:String(err?.message || err)});
});

app.get('/health',(req,res)=>res.json({ok:true,version:'7.2.2'}));
app.listen(PORT,()=>console.log(`IDV Acreditaciones v7.2.2: http://localhost:${PORT}`));
