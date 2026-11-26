# Node.js 纯净版部署与本地加密指南

## 1. 各文件作用与用法说明

* **`gen.js`（本地加密生成器，仅本地运行，不要上传到容器）**：内置待隐藏的配置、下载地址和协议参数，运行后会随机生成一把 64 位十六进制密钥和一份 AES-256-GCM 加密字典。生成完成后立即删除本地 `gen.js`，避免明文敏感词暴露或误传上服务器。
* **密钥文件 `.key`（解密钥匙，上传到容器）**：保存 `gen.js` 随机生成的 64 位密钥。容器启动时 `index.js` 会按顺序查找密钥（先读命令行参数，再读环境变量 `APP_KEY`，最后读本地 `.key`），拿到密钥后才能解密字典。
* **字典文件 `assets.dat`（加密字典，上传到容器）**：用 `.key` 加密后的参数字典文件。把明文参数藏进密文里，防止容器目录中的静态文件直接被关键词扫描命中。
* **`index.js`（主运行脚本，上传到容器）**：无注释纯净主程序。启动后先递归扫描并清理可能残留的 `gen.js`（先尝试 `0o755` 改权限再删除），读取密钥解密 `assets.dat`，按需下载核心与隧道程序，通过 `stdin:` 内存管道启动核心（不留明文 `config.json`），将生成的凭证 Base64 编码存入 `.cache`，并在控制台输出 Base64 节点链接。

---

## 2. 安装依赖（若提示 node 或 curl 未找到）

* **手机 Termux**：
  ```bash
  pkg update -y && pkg install -y nodejs curl
  ```
* **Debian / Ubuntu**：
  ```bash
  apt update && apt install -y nodejs curl
  ```
* **Alpine Linux**：
  ```bash
  apk add --no-cache nodejs curl
  ```
* **Windows PowerShell**：
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

安装完成后运行 `node -v` 确认版本号。

---

## 3. 拉取、运行并输出到 Download 目录

### 手机 Termux

1. 首次使用先执行并点“允许”：
   ```bash
   termux-setup-storage
   ```
2. 默认源（复制到 `~/storage/downloads/`，即手机 `Download` 目录）：
   ```bash
   mkdir -p ~/storage/downloads && curl -fsSL [https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js && node gen.js && cp -f assets.dat .key ~/storage/downloads/ && rm -f gen.js && ls -la ~/storage/downloads/
   ```
3. 国内备用源：
   ```bash
   mkdir -p ~/storage/downloads && curl -fsSL [https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js && node gen.js && cp -f assets.dat .key ~/storage/downloads/ && rm -f gen.js && ls -la ~/storage/downloads/
   ```

### 电脑

* **Linux / macOS 默认源（复制到 `~/Downloads`）**：
  ```bash
  mkdir -p ~/Downloads && curl -fsSL [https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js && node gen.js && cp -f assets.dat .key ~/Downloads/ && rm -f gen.js && ls -la ~/Downloads/
  ```
* **Linux / macOS 国内备用源**：
  ```bash
  mkdir -p ~/Downloads && curl -fsSL [https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js && node gen.js && cp -f assets.dat .key ~/Downloads/ && rm -f gen.js && ls -la ~/Downloads/
  ```
* **Windows PowerShell 默认源（复制到 Downloads）**：
  ```powershell
  $dl = "$env:USERPROFILE\Downloads"; New-Item -ItemType Directory -Force -Path $dl | Out-Null; curl.exe -fsSL [https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js; node gen.js; Copy-Item -Force assets.dat, .key $dl; Remove-Item -Force gen.js; Get-ChildItem -Force $dl
  ```
* **Windows PowerShell 国内备用源**：
  ```powershell
  $dl = "$env:USERPROFILE\Downloads"; New-Item -ItemType Directory -Force -Path $dl | Out-Null; curl.exe -fsSL [https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js](https://gh-proxy.com/https://raw.githubusercontent.com/bigcow666/NODE.JS-xhttp-enc-flow/main/gen.js) -o gen.js; node gen.js; Copy-Item -Force assets.dat, .key $dl; Remove-Item -Force gen.js; Get-ChildItem -Force $dl
  ```

---

## 4. 上传与运行说明

1. 将生成的 `assets.dat`、`.key` 以及无注释纯净版 `index.js` 上传到容器目录，不要上传 `gen.js` 和本说明。
2. 启动容器：`index.js` 会先递归扫描并清理残留的 `gen.js`（先尝试 `0o755` 改权限再删除），读取 `.key`（或启动参数 / `APP_KEY`）解密 `assets.dat`，通过 `stdin:` 内存管道启动核心（不生成明文 `config.json`），并将凭证 Base64 编码存入 `.cache`。
3. 首次启动复制控制台输出的 Base64 节点导入客户端；保存完成后把 `index.js` 中的 `PRINT_TOKEN` 改为 `false` 并重启。

---

## 5. `index.js` 参数说明

### 基础参数

| 参数名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `APP_TOKEN` | `''` | 固定隧道 Token；留空则自动使用临时模式。 |
| `APP_DOMAIN` | `''` | 固定隧道绑定的域名；临时模式留空。 |
| `APP_UID` | `''` | 自定义 UUID；留空则首次启动自动生成并持久化到 `.cache`。 |
| `APP_PATH` | `'/api/v1'` | 传输路径，可按需自定义。 |
| `APP_PORT` | `8080` | 本地回环监听端口，需与回源目标端口一致。 |
| `ENABLE_OPT` | `true` | 是否启用高级流控；若启动报错无法运行可改为 `false`。 |
| `APP_NAME` | `'Node-Service'` | 导出节点的备注名称。 |
| `PING_MIN` | `5` | 内部自访问保活间隔（分钟）；设为 `0` 关闭。 |
| `PRINT_TOKEN` | `true` | 是否在控制台打印 Base64 令牌；保存后建议改为 `false` 静默。 |
| `LOG_LEVEL` | `'error'` | 核心日志级别；排查用 `'info'`，日常用 `'error'` 或 `'none'`。 |
| `SHOW_NET_LOG` | `false` | 是否打印网络隧道原始输出；排查用 `true`，日常用 `false`。 |

### 填充混淆与连接复用参数

| 参数名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ENABLE_PAD` | `true` | `true` 开启填充混淆模式；`false` 关闭。 |
| `PAD_BYTES` | `'100-1000'` | 填充字节长度范围。 |
| `PAD_PLACE` | `'header'` | 填充位置，支持 `'header'` / `'cookie'` / `'query'`。 |
| `PAD_HEADER` | `'Cow-App-Context'` | `PAD_PLACE` 为 `'header'` 时使用的请求头名称。 |
| `PAD_KEY` | `'cow_utm_content'` | `PAD_PLACE` 为 `'cookie'` 或 `'query'` 时使用的键名。 |
| `PAD_METHOD` | `'tokenish'` | 填充生成方式，支持 `'tokenish'` / `'repeat-x'`。 |
| `MUX_CONN` | `'1-3'` | 开启混淆时的最大连接数范围。 |
| `MUX_CONC` | `'2-4'` | 关闭混淆时的单连接最大并发数范围。 |
| `MUX_REQ` | `'100-200'` | 单连接最大请求次数范围。 |
| `MUX_TTL` | `'30-60'` | 单连接最大复用秒数范围。 |
| `MUX_KEEP` | `15` | 连接心跳保活间隔（秒）。 |

### 文件与清理参数

| 参数名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `ASSET_FILE` | `'./assets.dat'` | AES-256-GCM 加密字典文件路径。 |
| `KEY_FILE` | `'./.key'` | 解密密钥文件路径（按启动参数、环境变量 `APP_KEY`、本地 `.key` 顺序读取）。 |
| `CACHE_FILE` | `'./.cache'` | 凭证持久化文件路径（Base64 编码存储）。 |
| `TARGET_SCRIPT` | `'gen.js'` | 启动时自动提权并递归清理的目标脚本文件名。 |
