// Dependency-free server: serves /public and stores uploaded videos in ./profiles
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROFILES_DIR = path.join(__dirname, 'profiles');
const MAX_BYTES = 200 * 1024 * 1024;
const STEPS = new Set(['front', 'back', 'face']);
const EXT = { 'video/webm': 'webm', 'video/mp4': 'mp4' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

fs.mkdirSync(PROFILES_DIR, { recursive: true });

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function handleUpload(req, res, url) {
  const step = url.searchParams.get('step');
  const session = url.searchParams.get('session') || '';
  if (!STEPS.has(step)) return send(res, 400, { error: 'invalid step' });
  if (!/^[a-f0-9]{32}$/.test(session)) return send(res, 400, { error: 'invalid session' });
  const mime = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = EXT[mime];
  if (!ext) return send(res, 415, { error: 'unsupported video type' });

  const dir = path.join(PROFILES_DIR, session);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${step}.${ext}`);
  const out = fs.createWriteStream(file);
  let size = 0;
  let failed = false;
  const fail = (code, msg) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.rm(file, { force: true }, () => {});
    send(res, code, { error: msg });
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BYTES) { fail(413, 'file too large'); req.destroy(); }
  });
  req.on('error', () => fail(500, 'upload failed'));
  out.on('error', () => fail(500, 'write failed'));
  out.on('finish', () => { if (!failed) send(res, 200, { ok: true, file: `profiles/${session}/${step}.${ext}` }); });
  req.pipe(out);
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/upload') return handleUpload(req, res, url);
  if (req.method === 'GET' && url.pathname === '/session') {
    return send(res, 200, { session: crypto.randomBytes(16).toString('hex') });
  }
  if (req.method === 'GET') {
    const name = url.pathname === '/' ? 'index.html' : path.basename(url.pathname);
    const file = path.join(PUBLIC_DIR, name);
    return fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
    });
  }
  send(res, 405, { error: 'method not allowed' });
}).listen(PORT, () => console.log(`ID verification running on http://localhost:${PORT}`));
