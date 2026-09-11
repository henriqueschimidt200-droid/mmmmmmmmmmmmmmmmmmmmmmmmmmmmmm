require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'mental-ai.sqlite'));

db.exec(`CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  lifetime INTEGER DEFAULT 0
)`);

// On a free Render instance the filesystem is temporary. This keeps the demo functional;
// use a persistent database later if you need permanent accounts.
const JWT = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';
const PREMIUM_CODE = process.env.PREMIUM_CODE || '';
const PORT = Number(process.env.PORT || 3000);

function token(u) { return jwt.sign({ id: u.id, email: u.email }, JWT, { expiresIn: '30d' }); }
function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    if (!raw.startsWith('Bearer ')) throw new Error();
    req.user = jwt.verify(raw.slice(7), JWT); next();
  } catch { res.status(401).json({ error: 'Faça login primeiro.' }); }
}
function getUser(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function publicUser(u) { return { id:u.id, email:u.email, plan:u.plan, lifetime:Boolean(u.lifetime) }; }

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req,res) => res.json({ ok:true, ai:!!OPENROUTER_API_KEY, model:OPENROUTER_MODEL }));
app.get('/api/config', (req,res) => res.json({ app:'Mental AI', version:'2.0' }));

app.post('/api/auth/signup', async (req,res) => {
  try {
    const e=String(req.body.email||'').trim().toLowerCase();
    const p=String(req.body.password||'');
    if(!/^\S+@\S+\.\S+$/.test(e)) return res.status(400).json({error:'E-mail inválido.'});
    if(p.length<8) return res.status(400).json({error:'Senha mínima: 8 caracteres.'});
    const h=await bcrypt.hash(p,12);
    const r=db.prepare('INSERT INTO users(email,password_hash) VALUES(?,?)').run(e,h);
    res.json({token:token({id:r.lastInsertRowid,email:e}),message:'Conta criada.'});
  } catch { res.status(400).json({error:'E-mail já cadastrado.'}); }
});

app.post('/api/auth/login', async (req,res) => {
  const e=String(req.body.email||'').trim().toLowerCase();
  const u=db.prepare('SELECT * FROM users WHERE email=?').get(e);
  if(!u || !(await bcrypt.compare(String(req.body.password||''),u.password_hash))) return res.status(401).json({error:'E-mail ou senha inválidos.'});
  res.json({token:token(u),message:'Login realizado.',user:publicUser(u)});
});

app.get('/api/me',auth,(req,res)=>{const u=getUser(req.user.id);if(!u)return res.status(404).json({error:'Usuário não encontrado.'});res.json({user:publicUser(u)});});

const personas={
 'Ayla Neri':'acolhedora e empática', 'Noa Valen':'reflexiva e serena', 'Mina Solis':'suave e otimista',
 'Theo Arven':'homem, firme e sereno', 'Iris Vellum':'articulada e calorosa'
};

const usage=new Map();
function allowed(id){
  const day=new Date().toISOString().slice(0,10), key=id+':'+day;
  const n=usage.get(key)||0; if(n>=30)return false; usage.set(key,n+1); return true;
}

app.post('/api/chat',auth,async(req,res)=>{
  if(!OPENROUTER_API_KEY)return res.status(503).json({error:'A IA ainda não foi configurada. Adicione OPENROUTER_API_KEY no Render.'});
  if(!allowed(req.user.id))return res.status(429).json({error:'Limite gratuito diário atingido. Tente novamente amanhã.'});
  const character=String(req.body.character||'Ayla Neri');
  const message=String(req.body.message||'').trim();
  if(!message)return res.status(400).json({error:'Digite uma mensagem.'});
  if(message.length>8000)return res.status(400).json({error:'Mensagem muito longa.'});
  const system=`Você é ${character}, ${personas[character]||'acolhedora'}. Responda em português natural, humano, acolhedor e claro. Não afirme ser psicólogo, médico ou profissional humano. Não substitua atendimento profissional. Se houver risco imediato de autoagressão, violência ou perigo, incentive a pessoa a procurar imediatamente serviços de emergência locais e alguém de confiança.`;
  try{
    const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENROUTER_API_KEY}`,'HTTP-Referer':process.env.APP_URL||'https://mental-ai.onrender.com','X-Title':'Mental AI'},
      body:JSON.stringify({model:OPENROUTER_MODEL,messages:[{role:'system',content:system},{role:'user',content:message}],temperature:0.8,max_tokens:800})
    });
    const d=await r.json();
    if(!r.ok) throw new Error(d?.error?.message||'OpenRouter API error');
    const reply=d?.choices?.[0]?.message?.content?.trim();
    res.json({reply:reply||'Não consegui gerar uma resposta agora.'});
  }catch(err){console.error('OpenRouter:',err.message);res.status(500).json({error:'A IA não respondeu agora. Verifique a chave OPENROUTER_API_KEY e tente novamente.'});}
});

app.post('/api/redeem',auth,(req,res)=>{
  if(!PREMIUM_CODE || String(req.body.code||'')!==PREMIUM_CODE)return res.status(400).json({error:'Código inválido.'});
  db.prepare("UPDATE users SET lifetime=1,plan='premium' WHERE id=?").run(req.user.id);
  res.json({message:'Premium vitalício ativado!'});
});

app.use((req,res)=>res.sendFile(path.join(__dirname,'public/index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`Mental AI online na porta ${PORT}`));
