const fs = require('fs');
const crypto = require('crypto');

const dict = {
  u1: 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-arm64-v8a.zip',
  u2: 'https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip',
  u3: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64',
  u4: 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64',
  binEntry: 'xray',
  cmdUid: 'uuid',
  cmdEnc: 'vlessenc',
  cmdRun: ['run', '-c', 'stdin:'],
  netFixed: ['tunnel', '--no-autoupdate', '--protocol', 'http2', 'run', '--token'],
  netTemp: ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url'],
  rxDec: '"decryption":\\s*"([^"]+)"',
  rxEnc: '"encryption":\\s*"([^"]+)"',
  prefEnc: 'mlkem768',
  rxDom: 'https:\\/\\/([a-z0-9-]+\\.trycloudflare\\.com)',
  kLog: 'log',
  kLv: 'loglevel',
  kIn: 'inbounds',
  kOut: 'outbounds',
  kProto: 'protocol',
  vProto: 'vless',
  vFree: 'freedom',
  kSet: 'settings',
  kCli: 'clients',
  kFlow: 'flow',
  vFlow: 'xtls-rprx-vision',
  kDec: 'decryption',
  kStream: 'streamSettings',
  kNet: 'network',
  vNet: 'xhttp',
  kSec: 'security',
  kXSet: 'xhttpSettings',
  kPb: 'xPaddingBytes',
  kPo: 'xPaddingObfsMode',
  kPh: 'xPaddingHeader',
  kPk: 'xPaddingKey',
  kPp: 'xPaddingPlacement',
  kPm: 'xPaddingMethod',
  kMux: 'xmux',
  kMc: 'maxConnections',
  kMcc: 'maxConcurrency',
  kMr: 'hMaxRequestTimes',
  kMs: 'hMaxReusableSecs',
  kMk: 'hKeepAlivePeriod',
  scheme: 'vless://',
  qEnc: '?encryption=',
  qFlow: '&flow=',
  qTls: '&security=tls&sni=',
  qMid: '&fp=chrome&alpn=h2&type=xhttp&host=',
  qPath: '&path=',
  qMode: '&mode=packet-up',
  qExtra: '&extra='
};

const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const enc = Buffer.concat([cipher.update(JSON.stringify(dict), 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

fs.writeFileSync('./assets.dat', Buffer.concat([iv, tag, enc]));
fs.writeFileSync('./.key', key.toString('hex'), 'utf8');

console.log('生成完成：');
console.log('  1. assets.dat (AES-256-GCM 加密字典)');
console.log('  2. .key       (随机 64 位密钥)');
console.log('\n请仅上传 index.js、assets.dat 和 .key 到容器，不要上传 gen.js。');
