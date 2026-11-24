# NODE.JS-xhttp-enc-flow
下载index.js填写必要参数，上传到游戏机nodaroo的文件目录，点击start
**#xhttp #心跳包**
**xhttp extra 配置 粘贴下面代码到v2rayn xhttp节点的extra输入框**

**垃圾线路设置 maxConcurrency**，理解为限制每条管道里的线缆数量，但不限制管道数量。越低越好，防止单条管道堵塞导致管道内所有连接都连不上，影响多种 App。

**垃圾机过CF（模式选 packet-up）**
```json
{
  "xPaddingBytes": "100-1000",
  "xmux": {
    "maxConcurrency": "2-4",
    "hMaxRequestTimes": "100-200",
    "hMaxReusableSecs": "30-60",
    "hKeepAlivePeriod": 15
  }
}
```

**大鸡/优质鸡/直连/游戏机过CF设置 maxConnections**，越低越好，理解为限制连接管道总数。Chrome 浏览器不会建立太多管道，设置高了容易暴露特征。（模式选 auto）
```json
{
  "xPaddingBytes": "100-1000",
  "xmux": {
    "maxConnections": "1-3",
    "hMaxRequestTimes": "100-200",
    "hMaxReusableSecs": "30-60",
    "hKeepAlivePeriod": 15
  }
}
```

**maxConcurrency** 限制每条管道里的最大线缆数量，但不限制多少管道

**maxConnections** 限制连接管道总数，但不限制每条管道里的线缆数量。

**hMaxRequestTimes** 一条管道传输多少次关闭，手机网络适度偏低，防止切屏假死

**hMaxReusableSecs** 一条管道多长时间过期，手机网络适度偏低，防止切屏假死

**hKeepAlivePeriod** 心跳保活时间 过CF时 只能保活客户端到cf边缘节点

