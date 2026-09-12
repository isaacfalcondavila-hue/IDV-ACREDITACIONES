const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIA-ESTA-CLAVE';
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

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
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','open','closed','archived')),
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
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','delivered')),
  assignment TEXT DEFAULT '',
  admin_notes TEXT DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  delivered_at TEXT,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE(event_id, document)
);

CREATE INDEX IF NOT EXISTS idx_requests_event ON requests(event_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_code ON requests(public_code);

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

`);

const adminEmail = (process.env.ADMIN_EMAIL || 'prensa@idv.ec').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'IDV2026!';
if (!db.prepare('SELECT id FROM admins WHERE email=?').get(adminEmail)) {
  db.prepare('INSERT INTO admins(email,password_hash) VALUES(?,?)')
    .run(adminEmail, bcrypt.hashSync(adminPassword, 10));
}

app.use(express.json({limit:'1mb'}));
app.use(cookieParser());
// Frontend servido desde la raíz para simplificar GitHub/Railway.
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/index.html',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.get('/prensa.html',(req,res)=>res.sendFile(path.join(__dirname,'prensa.html')));
app.get('/fotografos.html',(req,res)=>res.sendFile(path.join(__dirname,'fotografos.html')));
app.get('/admin.html',(req,res)=>res.sendFile(path.join(__dirname,'admin.html')));
app.get('/estado.html',(req,res)=>res.sendFile(path.join(__dirname,'estado.html')));
app.get('/verificar.html',(req,res)=>res.sendFile(path.join(__dirname,'verificar.html')));
app.get('/styles.css',(req,res)=>res.sendFile(path.join(__dirname,'styles.css')));

function clean(v){ return String(v ?? '').trim(); }
function auth(req,res,next){
  const token = req.cookies.idv_admin;
  if(!token) return res.status(401).json({error:'No autorizado'});
  try{ req.admin = jwt.verify(token, JWT_SECRET); next(); }
  catch{ return res.status(401).json({error:'Sesión inválida'}); }
}
function publicCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s='IDV-';
  for(let i=0;i<8;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}
function uniqueCode(){
  let c; do{c=publicCode()}while(db.prepare('SELECT 1 FROM requests WHERE public_code=?').get(c));
  return c;
}
function uniqueToken(){
  let t; do{t=crypto.randomBytes(20).toString('hex')}while(db.prepare('SELECT 1 FROM requests WHERE verify_token=?').get(t));
  return t;
}
function activeEvent(){
  const open = db.prepare(`SELECT * FROM events WHERE status='open' ORDER BY event_date ASC LIMIT 1`).get();
  if(!open) return undefined;
  if(open.deadline){
    const deadline = new Date(open.deadline);
    if(!Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now()){
      db.prepare(`UPDATE events SET status='closed' WHERE id=?`).run(open.id);
      return undefined;
    }
  }
  return open;
}

app.post('/api/admin/login',(req,res)=>{
  const email=clean(req.body.email).toLowerCase();
  const password=String(req.body.password||'');
  const a=db.prepare('SELECT * FROM admins WHERE email=?').get(email);
  if(!a || !bcrypt.compareSync(password,a.password_hash))
    return res.status(401).json({error:'Correo o contraseña incorrectos'});
  const token=jwt.sign({id:a.id,email:a.email},JWT_SECRET,{expiresIn:'12h'});
  res.cookie('idv_admin',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:12*3600*1000});
  res.json({ok:true});
});
app.post('/api/admin/logout',(req,res)=>{res.clearCookie('idv_admin');res.json({ok:true})});
app.get('/api/admin/me',auth,(req,res)=>res.json({admin:req.admin}));

app.get('/api/public/event',(req,res)=>{
  const e=activeEvent();
  if(!e) return res.json({event:null});
  res.json({event:e});
});

app.post('/api/public/requests',(req,res)=>{
  const event=activeEvent();
  if(!event) return res.status(409).json({error:'Las acreditaciones no están abiertas en este momento.'});

  const category=req.body.category==='photo'?'photo':'press';
  const data={
    firstName:clean(req.body.firstName), lastName:clean(req.body.lastName),
    document:clean(req.body.document), mediaName:clean(req.body.mediaName),
    roleTitle:clean(req.body.roleTitle), coverage:clean(req.body.coverage),
    email:clean(req.body.email).toLowerCase(), phone:clean(req.body.phone),
    notes:clean(req.body.notes)
  };
  if(Object.values(data).slice(0,8).some(v=>!v))
    return res.status(400).json({error:'Completa todos los campos obligatorios.'});

  const code=uniqueCode();
  try{
    db.prepare(`INSERT INTO requests
      (event_id,public_code,category,first_name,last_name,document,media_name,role_title,coverage,email,phone,notes)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(event.id,code,category,data.firstName,data.lastName,data.document,data.mediaName,data.roleTitle,data.coverage,data.email,data.phone,data.notes);
    res.json({ok:true,publicCode:code,statusUrl:`${PUBLIC_URL}/estado.html?codigo=${encodeURIComponent(code)}`});
  }catch(e){
    if(String(e.message).includes('UNIQUE'))
      return res.status(409).json({error:'Ya existe una solicitud con este documento para este partido.'});
    console.error(e);
    res.status(500).json({error:'No se pudo guardar la solicitud.'});
  }
});

app.get('/api/public/status/:code',(req,res)=>{
  const r=db.prepare(`SELECT r.public_code,r.category,r.first_name,r.last_name,r.media_name,r.role_title,
    r.status,r.assignment,r.admin_notes,r.submitted_at,e.title,e.event_date,e.venue,r.verify_token
    FROM requests r JOIN events e ON e.id=r.event_id WHERE r.public_code=?`).get(req.params.code);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  res.json({
    ...r,
    qrUrl: r.verify_token && ['approved','delivered'].includes(r.status)
      ? `/api/public/qr/${r.verify_token}` : null,
    verifyUrl: r.verify_token ? `${PUBLIC_URL}/verificar.html?t=${r.verify_token}` : null
  });
});

app.get('/api/public/qr/:token',async(req,res)=>{
  const r=db.prepare(`SELECT verify_token,status FROM requests WHERE verify_token=?`).get(req.params.token);
  if(!r || !['approved','delivered'].includes(r.status)) return res.status(404).end();
  res.type('png');
  await QRCode.toFileStream(res,`${PUBLIC_URL}/verificar.html?t=${r.verify_token}`,{width:500,margin:2,errorCorrectionLevel:'M'});
});

app.get('/api/public/verify/:token',(req,res)=>{
  const r=db.prepare(`SELECT r.id,r.public_code,r.category,r.first_name,r.last_name,r.media_name,r.role_title,
    r.status,r.assignment,e.id event_id,e.title,e.event_date,e.venue
    FROM requests r JOIN events e ON e.id=r.event_id WHERE r.verify_token=?`).get(req.params.token);
  if(!r) return res.status(404).json({error:'Acreditación no encontrada'});
  const vest = r.category==='photo'
    ? db.prepare(`SELECT vest_number,credential_retained,checkout_at,returned_at,status
                  FROM vest_loans WHERE request_id=?`).get(r.id)
    : null;
  res.json({...r, vest});
});

app.get('/api/admin/events',auth,(req,res)=>{
  const rows=db.prepare(`SELECT e.*,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id) total_requests,
    (SELECT COUNT(*) FROM requests r WHERE r.event_id=e.id AND r.status='pending') pending_requests
    FROM events e ORDER BY event_date DESC`).all();
  res.json(rows);
});

app.post('/api/admin/events',auth,(req,res)=>{
  const title=clean(req.body.title), opponent=clean(req.body.opponent), eventDate=clean(req.body.eventDate),
    venue=clean(req.body.venue), deadline=clean(req.body.deadline);
  if(!title || !eventDate) return res.status(400).json({error:'Título y fecha son obligatorios.'});
  const result=db.prepare(`INSERT INTO events(title,opponent,event_date,venue,deadline,status) VALUES(?,?,?,?,?,'draft')`)
    .run(title,opponent,eventDate,venue,deadline);
  res.json({ok:true,id:result.lastInsertRowid});
});

app.patch('/api/admin/events/:id',auth,(req,res)=>{
  const id=Number(req.params.id);
  const e=db.prepare('SELECT * FROM events WHERE id=?').get(id);
  if(!e) return res.status(404).json({error:'Evento no encontrado'});
  const status=req.body.status ?? e.status;
  if(!['draft','open','closed','archived'].includes(status)) return res.status(400).json({error:'Estado inválido'});
  if(status==='open') db.prepare(`UPDATE events SET status='closed' WHERE status='open' AND id<>?`).run(id);
  db.prepare(`UPDATE events SET title=?,opponent=?,event_date=?,venue=?,deadline=?,status=? WHERE id=?`)
    .run(clean(req.body.title ?? e.title),clean(req.body.opponent ?? e.opponent),clean(req.body.eventDate ?? e.event_date),
         clean(req.body.venue ?? e.venue),clean(req.body.deadline ?? e.deadline),status,id);
  res.json({ok:true});
});

app.get('/api/admin/requests',auth,(req,res)=>{
  const eventId=Number(req.query.eventId||0);
  const status=clean(req.query.status);
  let sql=`SELECT r.*,e.title event_title FROM requests r JOIN events e ON e.id=r.event_id WHERE 1=1`;
  const params=[];
  if(eventId){sql+=' AND r.event_id=?';params.push(eventId)}
  if(status){sql+=' AND r.status=?';params.push(status)}
  sql+=' ORDER BY r.submitted_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.patch('/api/admin/requests/:id',auth,(req,res)=>{
  const id=Number(req.params.id);
  const r=db.prepare('SELECT * FROM requests WHERE id=?').get(id);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  const status=req.body.status ?? r.status;
  if(!['pending','approved','rejected','delivered'].includes(status))
    return res.status(400).json({error:'Estado inválido'});
  let token=r.verify_token;
  if(status==='approved' && !token) token=uniqueToken();
  if(status==='rejected') token=null;
  const assignment=clean(req.body.assignment ?? r.assignment);
  const adminNotes=clean(req.body.adminNotes ?? r.admin_notes);
  const reviewedAt=['approved','rejected','delivered'].includes(status) ? new Date().toISOString() : r.reviewed_at;
  const deliveredAt=status==='delivered' ? new Date().toISOString() : (status==='approved'?null:r.delivered_at);
  db.prepare(`UPDATE requests SET status=?,assignment=?,admin_notes=?,verify_token=?,reviewed_at=?,delivered_at=? WHERE id=?`)
    .run(status,assignment,adminNotes,token,reviewedAt,deliveredAt,id);
  res.json({ok:true});
});

app.delete('/api/admin/requests/:id',auth,(req,res)=>{
  db.prepare('DELETE FROM requests WHERE id=?').run(Number(req.params.id));
  res.json({ok:true});
});


app.get('/api/admin/scan/:token',auth,(req,res)=>{
  const r=db.prepare(`SELECT r.*,e.title event_title,e.event_date,e.venue
    FROM requests r JOIN events e ON e.id=r.event_id
    WHERE r.verify_token=?`).get(req.params.token);
  if(!r) return res.status(404).json({error:'Acreditación no encontrada'});
  const vest=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(r.id) || null;
  res.json({request:r,vest});
});

app.post('/api/admin/vests/checkout/:requestId',auth,(req,res)=>{
  const requestId=Number(req.params.requestId);
  const r=db.prepare(`SELECT * FROM requests WHERE id=?`).get(requestId);
  if(!r) return res.status(404).json({error:'Solicitud no encontrada'});
  if(r.category!=='photo') return res.status(400).json({error:'El control de chaleco solo aplica a fotógrafos.'});
  if(!['approved','delivered'].includes(r.status))
    return res.status(409).json({error:'El fotógrafo debe estar aprobado antes de entregar un chaleco.'});

  const vestNumber=clean(req.body.vestNumber);
  const signature=clean(req.body.signature);
  const retained=req.body.credentialRetained ? 1 : 0;
  if(!vestNumber) return res.status(400).json({error:'Ingresa el número de chaleco.'});
  if(!signature || signature.length < 50) return res.status(400).json({error:'Falta la firma de recepción.'});

  const existing=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(requestId);
  if(existing && existing.status==='out')
    return res.status(409).json({error:`Este fotógrafo ya tiene el chaleco ${existing.vest_number}.`});
  if(existing && existing.status==='returned')
    return res.status(409).json({error:'Este fotógrafo ya completó un ciclo de chaleco para este evento.'});

  const busy=db.prepare(`SELECT vl.*,r.first_name,r.last_name
    FROM vest_loans vl JOIN requests r ON r.id=vl.request_id
    WHERE vl.event_id=? AND vl.vest_number=? AND vl.status='out'`).get(r.event_id,vestNumber);
  if(busy) return res.status(409).json({error:`El chaleco ${vestNumber} ya está en uso por ${busy.first_name} ${busy.last_name}.`});

  db.prepare(`INSERT INTO vest_loans(event_id,request_id,vest_number,credential_retained,checkout_signature,status)
              VALUES(?,?,?,?,?,'out')`)
    .run(r.event_id,requestId,vestNumber,retained,signature);
  res.json({ok:true});
});

app.post('/api/admin/vests/return/:requestId',auth,(req,res)=>{
  const requestId=Number(req.params.requestId);
  const loan=db.prepare(`SELECT * FROM vest_loans WHERE request_id=?`).get(requestId);
  if(!loan) return res.status(404).json({error:'No hay un chaleco registrado para este fotógrafo.'});
  if(loan.status==='returned') return res.status(409).json({error:'Este chaleco ya fue registrado como devuelto.'});

  const vestNumber=clean(req.body.vestNumber);
  const signature=clean(req.body.signature);
  if(vestNumber!==loan.vest_number)
    return res.status(409).json({error:`El chaleco asignado es el N.º ${loan.vest_number}. Verifica el número antes de continuar.`});
  if(!signature || signature.length < 50) return res.status(400).json({error:'Falta la firma de devolución.'});

  db.prepare(`UPDATE vest_loans SET status='returned',return_signature=?,returned_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(signature,loan.id);
  res.json({ok:true,credentialRetained:!!loan.credential_retained});
});

app.get('/api/admin/vests',auth,(req,res)=>{
  try{
    const eventIdRaw=clean(req.query.eventId);
    const eventId=eventIdRaw ? Number(eventIdRaw) : 0;

    if(eventIdRaw && (!Number.isInteger(eventId) || eventId <= 0)){
      return res.status(400).json({
        ok:false,
        error:'El evento seleccionado no es válido.',
        received:eventIdRaw
      });
    }

    const allCount=db.prepare('SELECT COUNT(*) AS c FROM vest_loans').get().c;
    const eventCount=eventId
      ? db.prepare('SELECT COUNT(*) AS c FROM vest_loans WHERE event_id=?').get(eventId).c
      : allCount;

    let sql=`SELECT
        vl.id,vl.event_id,vl.request_id,vl.vest_number,vl.credential_retained,
        vl.checkout_signature,vl.checkout_at,vl.return_signature,vl.returned_at,vl.status,
        r.first_name,r.last_name,r.media_name,r.public_code,r.document,r.role_title,
        e.title AS event_title
      FROM vest_loans vl
      INNER JOIN requests r ON r.id=vl.request_id
      INNER JOIN events e ON e.id=vl.event_id`;

    const params=[];
    if(eventId){
      sql+=' WHERE vl.event_id=?';
      params.push(eventId);
    }

    // IMPORTANTE: 'out' es un string SQL y por eso usa comillas simples.
    sql+=" ORDER BY CASE WHEN vl.status='out' THEN 0 ELSE 1 END, vl.checkout_at DESC, CAST(vl.vest_number AS INTEGER), vl.vest_number";

    const rows=db.prepare(sql).all(...params);

    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      ok:true,
      eventId:eventId||null,
      totalAll:allCount,
      totalForEvent:eventCount,
      serverTime:new Date().toISOString(),
      rows
    });
  }catch(err){
    console.error('[VESTS_GET_ERROR]',err);
    res.status(500).json({
      ok:false,
      error:'No se pudo consultar el control de chalecos.',
      detail:String(err && err.message ? err.message : err)
    });
  }
});

app.get('/api/admin/events/:id/security.csv',auth,(req,res)=>{
  const eventId=Number(req.params.id);
  const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if(!event) return res.status(404).json({error:'Evento no encontrado'});
  const rows=db.prepare(`SELECT category,first_name,last_name,document,media_name,role_title,assignment,status
                         FROM requests
                         WHERE event_id=? AND status IN ('approved','delivered')
                         ORDER BY category,media_name,last_name,first_name`).all(eventId);
  const escCsv=v=>{
    const s=String(v??'');
    return /[",\\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
  };
  const header=['Tipo','Nombres','Apellidos','Documento','Medio','Función','Asignación','Estado'];
  const body=rows.map(r=>[
    r.category==='press'?'Prensa escrita':'Fotógrafo',
    r.first_name,r.last_name,r.document,r.media_name,r.role_title,r.assignment||'',r.status
  ].map(escCsv).join(','));
  const csv='\\uFEFF'+[header.join(','),...body].join('\\r\\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="seguridad-${eventId}.csv"`);
  res.send(csv);
});

app.get('/seguridad.html',auth,(req,res,next)=>next());


// Cualquier error ocurrido dentro de /api debe regresar JSON.
// Esto evita que el frontend intente interpretar una página HTML de Express como JSON.
app.use('/api',(err,req,res,next)=>{
  console.error('[API_ERROR]',req.method,req.originalUrl,err);
  if(res.headersSent) return next(err);
  res.status(500).json({
    ok:false,
    error:'Error interno del servidor.',
    detail:String(err && err.message ? err.message : err)
  });
});

app.get('/health',(req,res)=>res.json({ok:true}));
app.listen(PORT,()=>console.log(`IDV Acreditaciones v6.2: http://localhost:${PORT}`));
