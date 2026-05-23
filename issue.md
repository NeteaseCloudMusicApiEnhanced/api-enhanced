# xeapi / Aegis 加密算法 — 完整逆向文档

从 Netase CloudMusic Android APK (ncm.apk) 及 libAegisSDK.so 逆向分析得出。

---

## 1. 概述

xeapi (X Encrypted API) 是网易云音乐使用的 API 请求加密方案。启用后，客户端发往 `*.music.163.com` 的 HTTP 请求经过三层嵌套加密，URL 路径从 `/api/` 改写为 `/xeapi/`。

### 启用条件

AB 实验标志 `enableXeapiEncrypt8420` 控制，通过 `IABTestManager.checkBelongGroup()` 检查。

| 文件 | 类 | 作用 |
|------|----|------|
| `smali_classes6/p62/ise.smali` | p62/ise | AB 标志检查 (lazy boolean) |
| `smali_classes16/f6/k.smali` | f6/k | AB 实验注册 (列表中的 method a()) |

---

## 2. 架构总览


OKHttp 拦截器链
├─ n72/b (分发器)
│  └─ 非 API 主机 -- n72/e (extends v62/d, API 请求)
│     └─ n72/d (extends v62/p, 非 API 请求)
│        └─ n72/a (抽象基类, implements okhttp3.Interceptor)
│           ├─ intercept()
│           │   └─ e() [encryptApi/encryptXeApi]
│           └─ a() [abstract: 实际加密]
│              └─ p62/f (extends p62/c AbsEncryptConfig)
│                 └─ c() -> AegisNative.encrypt(data) -- libAegisSDK.so
│                    └─ p62/y {EncryptProbeScheduler}
│                       └─ 降级: ENCRYPT_XEAPI ↔ CLIENT_FALLBACK


### URL 改写

**原始请求**：`POST /api/some/endpoint`

**加密后**：`POST /xeapi/some/endpoint`  
`Body: params=B=base64(cipherB)&S=base64(cipherS)&R=base64(cipherR)`

---

## 3. 本地库: libAegisSDK.so

### 属性

| 属性 | 值 |
|------|----|
| 架构 | ARM64 (AARCH64:LE64:v8A) |
| 镜像基址 | 0x09106000 |
| 函数数量 | 8115 |
| 符号数量 | 45447 |
| 加密库 | BoringSSL/OpenSSL (EVP, EC, HKDF, AES-GCM) |

### 关键导出函数

| 函数 | 地址 | 描述 |
|------|------|------|
| Aegis_InitializeEngine | 0x0921474 | 初始化加密引擎 |
| Aegis_Encrypt | 0x09214714 | 顶层加密入口 |
| Aegis_Free | 0x092149a8 | 释放加密结果 |
| Aegis_UpdatePublicKey | 0x092149b4 | 更新服务器 ECC 公钥 |
| Aegis_SetSession | 0x092149f0 | 设置会话密钥 |
| Aegis_DestroyEngine | 0x09214bec | 销毁引擎 |
| Aegis_SetTrackingListener | 0x09214c9c | 设置追踪回调 |

### JNI 桥接 (Java → Native)

| JAVA 方法 | NATIVE 函数 | 地址 |
|-----------|-------------|------|
| encrypt(String) | Aegis_Encrypt | 0x09214714 |
| initializeEngine(...) | Aegis_InitializeEngine | 0x0921474 |
| updatePublicKey(boolean) | Aegis_UpdatePublicKey | 0x092149b4 |
| setSession(String, String) | Aegis_SetSession | 0x092149f0 |
| destroyEngine() | Aegis_DestroyEngine | 0x09214bec |
| onNetworkResponse(long, int, String) | Java_..._onNetworkResponse | 0x09231ad8 |

---

## 4. 加密算法详解

### 4.1 整体流程 (FUN_00216f58, 被 Aegis_Encrypt 调用)

**输入**：plaintext (JSON 参数)  
**输出**：`B=base64(cipherB) & S=base64(cipherS) & R=base64(cipherR)`

**步骤**：
1. 获取/生成动态密钥 (128-bit, 有效期 ~5 分钟)
2. 第 1 层：加密业务数据 → cipherB
3. 第 2 层：加密动态密钥 → cipherS
4. 第 3 层：加密版本信息 → cipherR

### 4.2 第 1 层：加密业务数据 (FUN_00218538, EncryptBusinessData)

**双重 AES-256-GCM**


plaintext (JSON)
├─ [Round 1] 静态 AES-256-GCM
│  ├─ IV: 引擎内置静态密钥 (param_1 + 0x18, 32 bytes)
│  ├─ KEY: 随机生成 (16 bytes)
│  └─ 输出: [IV,(16)] [ciphertext,1] [tag,(16)]
└─ Base64 编码
   └─ [Round 2] 动态 AES-256-GCM
      ├─ IV: 动态密钥 (16 bytes, 自动填充到 32)
      ├─ KEY: 随机生成 (16 bytes)
      └─ 输出: [IV,(16)] [ciphertext,1] [tag,(16)]


**cipherB 格式**: `IV(16) + AES-GCM-ct + tag(16)`

### 4.3 第 2 层：加密动态密钥 (FUN_00218738, EncryptDynamicKey)

**ECDH(P-256) + HKDF-SHA256 + AES-256-GCM**


服务器公钥 (base64 解码 -- 32 bytes, 来自 <filesdir>/aegissdk/public_key)
├─ 客户端生成临时 ECC 密钥对 (P-256/prime256v1)
├─ ECDH 密钥协商:
│  └─ sharedSecret = clientPrivateKey × serverPublicKey
│     └─ 输出: 32 bytes
├─ HKDF-SHA256 派生:
│  ├─ IKM = sharedSecret
│  ├─ salt = 全局数据 DAT_001a04c0 (16 bytes) -- 需从 SO 中提取
│  ├─ info = clientEphemeralPubKey (65 bytes, uncompressed)
│  └─ L = 16 bytes
│     └─ 输出: derivedKey (16 bytes -- 自动填充到 32)
└─ 随机 IV (12 bytes)
   └─ 明文 = base64(dynamicKey) " " base64(serverPubKey) " "
 version
      └─ AES-256-GCM 加密
         ├─ 密钥: derivedKey
         └─ IV: 随机 12 bytes
            └─ 输出: [ciphertext] [tag(16)]


**cipherS 格式**:

[clientEphemeralPubKey (65 bytes, uncompressed, 0x04 |x
| y)]
[IV (12 bytes)]
[AES-GCM ciphertext]
[GCM tag (16 bytes)]


> **重要**: 客户端临时公钥以明文形式存储在 `cipherS` 的前面。服务端用它 + 自己的私钥通过 ECDH 计算共享密钥。**服务端私钥仅在服务端，不在客户端二进制文件中。**

### 4.4 第 3 层：加密版本信息 (FUN_0021bbf6, EncryptVersionInfo)

**AES-256-GCM**

**明文**: `version | sessionId` (例如 `"1.0|abc123..."`)

- 静态 AES-256-GCM
  - 密钥: 引擎内置静态密钥 (与第 1 层相同)
  - IV: 随机生成 (16 bytes)
  - 输出: `[IV,(16)] [ciphertext] [tag,(16)]`

**cipherR 格式**: `IV(16) + AES-GCM-ct + tag(16)`

---

## 5. 密钥管理

| 密钥 | 长度 | 存储位置 | 生命周期 |
|------|------|----------|----------|
| 静态 AES 密钥 | 256-bit | 引擎状态 param_1+0x18 (硬编码) | 永久 |
| 动态密钥 | 128-bit | 引擎状态 param_1+0x10 | ~5 分钟 (aegisUpdateIntervalMinute 可配置) |
| 会话密钥 | 可变 | 由 Aegis_SetSession 设置 | 会话期间 |
| 客户端 ECC 密钥对 | P-256 | 引擎状态 param_1+0x08 | 引擎初始化时生成 |
| 服务器公钥 | P-256 | `<filesdir>/aegissdk/public_key` | publicKeyUpdateIntervalSecond (默认 120s) |
| HKDF salt | 128-bit | 全局数据 DAT_001a04c0 | 静态 |
| 服务端 ECC 私钥 | P-256 | 仅在服务端 | — |

---

## 6. 密码学原函数

从 `libAegisSDK.so` 导出符号及反编译代码确认：

| 原函数 | 库 | 用途 |
|--------|----|------|
| AES-256-GCM | BoringSSL (`EVP_EncryptInit_ex`, `EVP_EncryptUpdate`, `EVP_EncryptFinal_ex`, mode=2) | 所有对称加密 |
| ECDH over NIST P-256 | `ecp_nistz256_mul_mont`, `ecp_nistz256_point_add`, `ecp_nistz256_point_double` | 密钥协商 |
| HKDF-SHA256 | 自定义实现 (FUN_0022fbe0) | 密钥派生 |
| Base64 | FUN_0022fc4c (编码), FUN_002f330 (解码) | 编解码 |
| MT19937 / /dev/urandom | FUN_0022fca8, std::random_device | 随机数回退 |
| RDRAND | FUN_00311438, FUN_00311330 | 硬件随机数 |

---

## 7. 降级与探测机制 (p62/y EncryptProbeScheduler)

### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| encryptDegradeThreshold | 3 | 时间窗口内连续失败次数阈值 |
| encryptDegradeTimeWindowSecond | 80 | 滑动窗口大小 |
| probeIntervalSecond | 300 | 探测间隔 (5 分钟) |
| probeIntervalSecondMax | 1200 | 最大退避间隔 (20 分钟) |
| publicKeyUpdateIntervalSecond | 120 | 公钥更新间隔 (20 分钟) |
| aegisUpdateIntervalMinute | 1 | 动态密钥轮换间隔 |

### 状态机


ENCRYPT_XEAPI —(窗口内 N 次失败)—→ CLIENT_FALLBACK
                     ↑
                     └—(探测成功)—┘


### 相关日志

- `"recordEncryptFailure, client auto degrade triggered"`
- `"onProbeResult SUCCESS, recovered to ENCRYPT_XEAPI"`
- `"executeProbe, skipped because is not CLIENT_FALLBACK"`

---

## 8. 错误码

| 错误码 | 含义 |
|--------|------|
| 0 | 成功 |
| -2 | 参数无效 |
| -3 | 内存分配失败 |
| -4 | 引擎未初始化 |
| -5 (-0xfffffffb) | 动态密钥过期/缺失 |
| +200 ~ +299 | 动态 AES 加密失败 |
| +300 ~ +399 | 静态 AES 加密失败 |
| -600 (-0x258) | ECDH/HKDF/IV 错误 |
| -601 (-0x259) | ECDH 失败 |
| -1497 (-0x5da) | SSL 上下文创建失败 |
| -1498 (-0x5d9) | EVP 加密更新/完成失败 |

---

## 9. 实现文件

### 文件

| 文件 | 描述 |
|------|------|
| `encrypt.js` | Node.js 客户端加密实现 |
| `decrypt.js` | Node.js 服务端解密实现 (需要服务端 ECC 私钥) |

### 使用方法

javascript
const { xeapiEncrypt } = require("./encrypt");
const { xeapiDecrypt } = require("./decrypt");
const crypto = require("crypto");

// 服务端密钥对 (实际中服务端私钥仅在服务端)
const serverEcdh = crypto.createECDH("prime256v1");
serverEcdh.generateKeys();

// 客户端加密
const result = xeapiEncrypt(jsonData, {
  serverPublicKey: serverEcdh.getPublicKey(),
});

// 服务端解密 (需要私钥!)
const decrypted = xeapiDecrypt(
  result.encryptedParams,
  serverEcdh.getPrivateKey()
);
console.log(decrypted.plaintext);


### 待提取的常量

| 常量 | 来源 | 状态 |
|------|------|------|
| 静态 AES-256 密钥 | `p62/f.smali -- h() -- XOR decode` | ✅ 已提取 |
| HKDF salt | `DAT_001a04c0 (16 bytes)` | 🟡 待 Ghidra read_memory |
| 版本字符串 | `DAT_001a92e6` | 🟡 待提取 |

### 已提取: 静态 AES-256 密钥

**提取路径**:

p62/f.smali h():
"0tu8wLlmtHQ5yMS4sEX5D763Jfl9JLA1ymMRQ5zA9TkK0zJl0SX8p4="
    ↳ Base64 解码 -- 44 bytes
       ↳ XOR 解码 (key: 0xa1, 0xa3, 0xa2, 0xa3)
          "x5a8W8rqEn/CefdxI9XWc7ZKksDOaUF3g/K7E4p="
             ↳ Base64 解码
                ↳ 静态 AES-256 密钥: b31d1a4bf2ba849fe97edd55727d896dc1ed9ee492c0e86947c6dfb93b1


### XOR 解码函数 (对应 native decodeCache):

javascript
function xorDecode(b64Input) {
  const key = Buffer.from([0xa1, 0xa3, 0xa2, 0xa3]);
  const buf = Buffer.from(b64Input, 'base64');
  for (let i = 0; i < buf.length; i++) buf[i] ^= key[i % 4];
  return buf.toString('utf-8');
}


### 签名密钥 (p62/f.small g()):


"2vbr4NITf7Tpwdnb7Ll16e8W7urOlsrR89S2TXqIXIxWf5VSKe7K09dXf5Lby+Hkx+bM06sv6tfRKMc"
    ↳ XOR decode (same key)
    ↳ 非 base64 原始字节 (61 bytes, 作为 UTF-8 字符传递)