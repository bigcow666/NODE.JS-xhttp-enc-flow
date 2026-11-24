// ================= 参数配置区（按需修改） =================
const ARGO_TOKEN     = '';                     // 固定隧道 Token；留空则自动使用临时隧道
const ARGO_DOMAIN    = 'nodaroo.bgd.ipv64.de'; // 固定隧道绑定的域名；临时隧道留空
const CUSTOM_UUID    = '';                     // 自定义 UUID；留空则首次启动自动生成
const XHTTP_PATH     = '/xhttp';               // XHTTP 路径
const XRAY_PORT      = 8080;                   // Xray 本地监听端口（与隧道回源端口一致）
const FLOW           = 'xtls-rprx-vision';     // 流控；若 XHTTP 下报错无法启动，改为空字符串 ''
const NODE_NAME      = 'Argo-XHTTP-Enc';       // 节点备注名称
const XRAY_LOG_LEVEL = 'error';                // 排查用 'info'；日常用 'error'
const SHOW_ARGO_LOG  = false;                  // 排查用 true；日常用 false
// ========================================================

const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;
const GO_ENV = { ...process.env };

function extractFileFromZip(buf, targetName, outPath) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('无效的 ZIP 文件');
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
  throw new Error(`ZIP 中未找到 ${targetName}`);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function prepareBinaries() {
  const isArm = os.arch() === 'arm64';
  if (!fs.existsSync('./web')) {
    console.log('[初始化] 正在下载 Xray...');
    const xrayUrl = isArm
      ? 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-arm64-v8a.zip'
      : 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip';
    const zipBuf = await download(xrayUrl);
    extractFileFromZip(zipBuf, 'xray', './web');
    console.log('[初始化] Xray 准备完成');
  }

  if (!fs.existsSync('./bot')) {
    console.log('[初始化] 正在下载 cloudflared...');
    const cfUrl = isArm
      ? 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64'
      : 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64';
    const cfBuf = await download(cfUrl);
    fs.writeFileSync('./bot', cfBuf);
    fs.chmodSync('./bot', 0o755);
    console.log('[初始化] cloudflared 准备完成');
  }
}

function prepareConfig() {
  let meta = null;
  if (fs.existsSync('./meta.json')) {
    try {
      const saved = JSON.parse(fs.readFileSync('./meta.json', 'utf8'));
      if (saved.uuid && saved.decryption && saved.encryption) meta = saved;
    } catch (_) {}
  }

  if (!meta) {
    console.log('[初始化] 正在生成 UUID 与 VLESS Encryption 密钥...');
    const uuid = CUSTOM_UUID.trim() || execFileSync('./web', ['uuid']).toString().trim();
    const encOut = execFileSync('./web', ['vlessenc']).toString();
    const decMatches = [...encOut.matchAll(/"decryption":\s*"([^"]+)"/g)].map(m => m[1]);
    const encMatches = [...encOut.matchAll(/"encryption":\s*"([^"]+)"/g)].map(m => m[1]);
    const idx = decMatches.findIndex(s => s.includes('mlkem768'));

    meta = {
      uuid,
      decryption: decMatches[idx !== -1 ? idx : 0],
      encryption: encMatches[idx !== -1 ? idx : 0]
    };
    fs.writeFileSync('./meta.json', JSON.stringify(meta, null, 2));
  } else if (CUSTOM_UUID.trim() && meta.uuid !== CUSTOM_UUID.trim()) {
    meta.uuid = CUSTOM_UUID.trim();
    fs.writeFileSync('./meta.json', JSON.stringify(meta, null, 2));
  }

  const client = { id: meta.uuid };
  if (FLOW) client.flow = FLOW;

  const config = {
    log: { loglevel: XRAY_LOG_LEVEL },
    inbounds: [{
      listen: '127.0.0.1',
      port: XRAY_PORT,
      protocol: 'vless',
      settings: {
        clients: [client],
        decryption: meta.decryption
      },
      streamSettings: {
        network: 'xhttp',
        security: 'none',
        xhttpSettings: {
          path: XHTTP_PATH,
          mode: 'auto'
        }
      }
    }],
    outbounds: [{ protocol: 'freedom', tag: 'direct' }]
  };

  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
  console.log('[初始化] config.json 已更新');
  return meta;
}

function printLink(domain, meta) {
  const flowParam = FLOW ? `&flow=${encodeURIComponent(FLOW)}` : '';
  const rawLink = `vless://${meta.uuid}@${domain}:443?encryption=${encodeURIComponent(meta.encryption)}${flowParam}&security=tls&sni=${domain}&fp=chrome&alpn=h2&type=xhttp&host=${domain}&path=${encodeURIComponent(XHTTP_PATH)}&mode=packet-up#${encodeURIComponent(NODE_NAME)}`;
  const base64Link = Buffer.from(rawLink, 'utf8').toString('base64');

  console.log('\n================ Base64 节点链接 ================');
  console.log(base64Link);
  console.log('=================================================\n');
}

function startServices(meta) {
  const runXray = () => {
    const p = spawn('./web', ['run', '-c', 'config.json'], { env: GO_ENV, stdio: 'inherit' });
    p.on('exit', (code) => {
      console.log(`[Xray] 异常退出 (code: ${code})，3秒后重启...`);
      setTimeout(runXray, 3000);
    });
  };
  runXray();

  const argoArgs = ARGO_TOKEN
    ? ['tunnel', '--no-autoupdate', '--protocol', 'http2', 'run', '--token', ARGO_TOKEN]
    : ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${XRAY_PORT}`];

  let printed = false;
  if (ARGO_TOKEN && ARGO_DOMAIN) {
    printLink(ARGO_DOMAIN, meta);
    printed = true;
  }

  const runArgo = () => {
    const p = spawn('./bot', argoArgs, { env: GO_ENV });

    const handleOutput = (chunk) => {
      const text = chunk.toString();
      if (SHOW_ARGO_LOG) process.stdout.write(text);
      if (!printed) {
        const m = text.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/);
        if (m) {
          printLink(m[1], meta);
          printed = true;
        }
      }
    };

    p.stdout.on('data', handleOutput);
    p.stderr.on('data', handleOutput);
    p.on('exit', (code) => {
      console.log(`[Argo] 异常退出 (code: ${code})，3秒后重启...`);
      if (!ARGO_TOKEN) printed = false;
      setTimeout(runArgo, 3000);
    });
  };
  runArgo();

  http.createServer((_, res) => { res.writeHead(200); res.end('OK'); })
    .listen(PORT, () => console.log(`[保活] HTTP 服务已监听端口 ${PORT}`));
}

(async () => {
  try {
    await prepareBinaries();
    const meta = prepareConfig();
    startServices(meta);
  } catch (err) {
    console.error('[启动失败]', err);
    process.exit(1);
  }
})();
