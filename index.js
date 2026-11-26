const APP_TOKEN     = '';
const APP_DOMAIN    = '';
const APP_UID       = '';
const APP_PATH      = '/api/v1';
const APP_PORT      = 8080;
const ENABLE_OPT    = true;
const APP_NAME      = 'Node-Service';
const PING_MIN      = 5;
const PRINT_TOKEN   = true;
const LOG_LEVEL     = 'error';
const SHOW_NET_LOG  = false;

const ENABLE_PAD    = true;
const PAD_BYTES     = '100-1000';
const PAD_PLACE     = 'header';
const PAD_HEADER    = 'Cow-App-Context';
const PAD_KEY       = 'cow_utm_content';
const PAD_METHOD    = 'tokenish';
const MUX_CONN      = '1-3';
const MUX_CONC      = '2-4';
const MUX_REQ       = '100-200';
const MUX_TTL       = '30-60';
const MUX_KEEP      = 15;

const ASSET_FILE    = './assets.dat';
const KEY_FILE      = './.key';
const CACHE_FILE    = './.cache';

const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const GO_ENV = { ...process.env };

function loadDict() {
  let keyHex = (process.argv[2] || process.env.APP_KEY || '').trim();
  if (!keyHex && fs.existsSync(KEY_FILE)) {
    keyHex = fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  if (!keyHex) throw new Error('Missing key');
  if (!fs.existsSync(ASSET_FILE)) throw new Error('Missing asset file');

  const key = Buffer.from(keyHex, 'hex');
  const buf = fs.readFileSync(ASSET_FILE);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function extractEntry(buf, targetName, outPath) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Invalid archive');
  let pos = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);

  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOffset = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');

    if (name === targetName) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const compData = buf.subarray(dataStart, dataStart + compSize);
      const out = method === 8 ? zlib.inflateRawSync(compData) : compData;
      fs.writeFileSync(outPath, out);
      fs.chmodSync(outPath, 0o755);
      return;
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('Entry not found');
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function prepareBinaries(D) {
  const isArm = os.arch() === 'arm64';
  if (!fs.existsSync('./web')) {
    console.log('[Init] Downloading core module...');
    const zipBuf = await download(isArm ? D.u1 : D.u2);
    extractEntry(zipBuf, D.binEntry, './web');
    console.log('[Init] Core module ready.');
  }

  if (!fs.existsSync('./bot')) {
    console.log('[Init] Downloading network module...');
    const netBuf = await download(isArm ? D.u3 : D.u4);
    fs.writeFileSync('./bot', netBuf);
    fs.chmodSync('./bot', 0o755);
    console.log('[Init] Network module ready.');
  }
}

function saveMeta(meta) {
  const encoded = Buffer.from(JSON.stringify(meta), 'utf8').toString('base64');
  fs.writeFileSync(CACHE_FILE, encoded, 'utf8');
}

function loadMeta() {
  if (fs.existsSync('./config.json')) {
    try { fs.unlinkSync('./config.json'); } catch (_) {}
  }

  if (!fs.existsSync(CACHE_FILE) && fs.existsSync('./meta.json')) {
    try {
      const old = JSON.parse(fs.readFileSync('./meta.json', 'utf8'));
      const vals = Object.values(old);
      if (vals.length >= 3 && old.uuid) {
        const migrated = { u: old.uuid, d: old.decryption, e: old.encryption };
        saveMeta(migrated);
        fs.unlinkSync('./meta.json');
        return migrated;
      }
    } catch (_) {}
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const raw = Buffer.from(fs.readFileSync(CACHE_FILE, 'utf8').trim(), 'base64').toString('utf8');
      const saved = JSON.parse(raw);
      if (saved.u && saved.d && saved.e) return saved;
      if (saved.uuid && saved.decryption && saved.encryption) {
        const migrated = { u: saved.uuid, d: saved.decryption, e: saved.encryption };
        saveMeta(migrated);
        return migrated;
      }
    } catch (_) {}
  }
  return null;
}

function prepareConfig(D) {
  let meta = loadMeta();

  if (!meta) {
    console.log('[Init] Generating session credentials...');
    const u = APP_UID.trim() || execFileSync('./web', [D.cmdUid]).toString().trim();
    const out = execFileSync('./web', [D.cmdEnc]).toString();
    const decList = [...out.matchAll(new RegExp(D.rxDec, 'g'))].map(m => m[1]);
    const encList = [...out.matchAll(new RegExp(D.rxEnc, 'g'))].map(m => m[1]);
    const idx = decList.findIndex(s => s.includes(D.prefEnc));

    meta = {
      u,
      d: decList[idx !== -1 ? idx : 0],
      e: encList[idx !== -1 ? idx : 0]
    };
    saveMeta(meta);
  } else if (APP_UID.trim() && meta.u !== APP_UID.trim()) {
    meta.u = APP_UID.trim();
    saveMeta(meta);
  }

  const client = { id: meta.u };
  if (ENABLE_OPT) client[D.kFlow] = D.vFlow;

  const xSet = { path: APP_PATH, mode: 'auto', [D.kPb]: PAD_BYTES };
  const extraObj = { [D.kPb]: PAD_BYTES };

  if (ENABLE_PAD) {
    const padCfg = {
      [D.kPo]: true,
      [D.kPp]: PAD_PLACE,
      [D.kPm]: PAD_METHOD
    };
    if (PAD_PLACE === 'cookie' || PAD_PLACE === 'query') {
      padCfg[D.kPk] = PAD_KEY;
    } else {
      padCfg[D.kPh] = PAD_HEADER;
    }
    Object.assign(xSet, padCfg);
    Object.assign(extraObj, padCfg);
    extraObj[D.kMux] = {
      [D.kMc]: MUX_CONN,
      [D.kMr]: MUX_REQ,
      [D.kMs]: MUX_TTL,
      [D.kMk]: MUX_KEEP
    };
  } else {
    extraObj[D.kMux] = {
      [D.kMcc]: MUX_CONC,
      [D.kMr]: MUX_REQ,
      [D.kMs]: MUX_TTL,
      [D.kMk]: MUX_KEEP
    };
  }

  const config = {
    [D.kLog]: { [D.kLv]: LOG_LEVEL },
    [D.kIn]: [{
      listen: '127.0.0.1',
      port: APP_PORT,
      [D.kProto]: D.vProto,
      [D.kSet]: {
        [D.kCli]: [client],
        [D.kDec]: meta.d
      },
      [D.kStream]: {
        [D.kNet]: D.vNet,
        [D.kSec]: 'none',
        [D.kXSet]: xSet
      }
    }],
    [D.kOut]: [{ [D.kProto]: D.vFree, tag: 'direct' }]
  };

  console.log('[Init] Configuration loaded in memory.');
  return { meta, configStr: JSON.stringify(config), extraObj };
}

function printToken(D, domain, meta, extraObj) {
  if (!PRINT_TOKEN) return;
  const flowParam = ENABLE_OPT ? `${D.qFlow}${encodeURIComponent(D.vFlow)}` : '';
  const extraParam = `${D.qExtra}${encodeURIComponent(JSON.stringify(extraObj))}`;
  const raw = `${D.scheme}${meta.u}@${domain}:443${D.qEnc}${encodeURIComponent(meta.e)}${flowParam}${D.qTls}${domain}${D.qMid}${domain}${D.qPath}${encodeURIComponent(APP_PATH)}${D.qMode}${extraParam}#${encodeURIComponent(APP_NAME)}`; const token = Buffer.from(raw, 'utf8').toString('base64');  console.log('\n---------------- Access Token ----------------'); console.log(token); console.log('----------------------------------------------\n'); }  function startServices(D, { meta, configStr, extraObj }) { let activeDomain = (APP_TOKEN && APP_DOMAIN) ? APP_DOMAIN.trim() : '';  const runCore = () => { const p = spawn('./web', D.cmdRun, { env: GO_ENV, stdio: ['pipe', 'inherit', 'inherit'] }); p.stdin.on('error', () => {}); p.stdin.write(configStr); p.stdin.end();  p.on('exit', (code) => { console.log(`[Core] Exited (code: ${code}), restarting in 3s...`);
      setTimeout(runCore, 3000);
    });
  };
  runCore();

  const netArgs = APP_TOKEN
    ? [...D.netFixed, APP_TOKEN]
    : [...D.netTemp, `http://127.0.0.1:${APP_PORT}`];  let printed = false; if (activeDomain) { printToken(D, activeDomain, meta, extraObj); printed = true; }  const domRegex = new RegExp(D.rxDom); const runNet = () => { const p = spawn('./bot', netArgs, { env: GO_ENV });  const handleOutput = (chunk) => { const text = chunk.toString(); if (SHOW_NET_LOG) process.stdout.write(text); if (!printed) { const m = text.match(domRegex); if (m) { activeDomain = m[1]; printToken(D, activeDomain, meta, extraObj); printed = true; } } };  p.stdout.on('data', handleOutput); p.stderr.on('data', handleOutput); p.on('exit', (code) => { console.log(`[Worker] Exited (code: ${code}), restarting in 3s...`);
      if (!APP_TOKEN) {
        printed = false;
        activeDomain = '';
      }
      setTimeout(runNet, 3000);
    });
  };
  runNet();

  http.createServer((_, res) => { res.writeHead(200); res.end('OK'); })
    .listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));

  if (PING_MIN > 0) {
    console.log(`[Server] Heartbeat enabled (every ${PING_MIN} min)`);
    setInterval(() => {
      fetch(`http://127.0.0.1:${PORT}`, { signal: AbortSignal.timeout(8000) }).catch(() => {}); if (activeDomain) { fetch(`https://${activeDomain}`, { signal: AbortSignal.timeout(8000) }).catch(() => {});
      }
    }, PING_MIN * 60 * 1000);
  }
}

(async () => {
  try {
    const D = loadDict();
    await prepareBinaries(D);
    const state = prepareConfig(D);
    startServices(D, state);
  } catch (err) {
    console.error('[Error] Startup failed:', err.message || err);
    process.exit(1);
  }
})();
