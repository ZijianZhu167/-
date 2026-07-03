import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const defaultRootDir = process.cwd();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

let tokenCache = {
  token: "",
  expiresAt: 0
};

export async function startServer(options = {}) {
  const context = createContext(options);
  await ensureStore(context);

  const server = createServer(async (req, res) => {
    try {
      await route(req, res, context);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message || "Internal server error"
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(context.port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(`Feishu broadcast bot console: http://localhost:${context.port}`);
  return { server, port: context.port, context };
}

async function route(req, res, context) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/health" && req.method === "GET") {
    const config = getFeishuConfig(context);
    sendJson(res, 200, {
      ok: true,
      configured: config.missing.length === 0,
      missing: config.missing,
      sendIntervalMs: config.sendIntervalMs,
      port: context.port
    });
    return;
  }

  if (url.pathname === "/api/config" && req.method === "GET") {
    const config = getFeishuConfig(context);
    sendJson(res, 200, {
      ok: true,
      config: {
        appId: config.appId,
        hasAppSecret: Boolean(config.appSecret),
        port: config.port,
        sendIntervalMs: config.sendIntervalMs,
        configured: config.missing.length === 0,
        missing: config.missing
      }
    });
    return;
  }

  if (url.pathname === "/api/config" && req.method === "POST") {
    const body = await readBody(req);
    const config = normalizeConfigInput(body, getFeishuConfig(context));
    await writeEnvFile(context.configPath, config);
    tokenCache = { token: "", expiresAt: 0 };
    sendJson(res, 200, {
      ok: true,
      restartRequired: Number(config.PORT) !== context.port
    });
    return;
  }

  if (url.pathname === "/api/chats" && req.method === "GET") {
    sendJson(res, 200, { ok: true, chats: await readJson(context.chatsFile, []) });
    return;
  }

  if (url.pathname === "/api/chats/sync" && req.method === "POST") {
    assertConfigured(context);
    const remoteChats = await listBotChats(context);
    const chats = await readJson(context.chatsFile, []);
    const existingById = new Map(chats.map((chat) => [chat.chatId, chat]));
    const nextById = new Map();

    for (const remoteChat of remoteChats) {
      const chatId = remoteChat.chat_id || remoteChat.chatId;
      if (!chatId) continue;
      const current = existingById.get(chatId);
      nextById.set(chatId, {
        chatId,
        name: remoteChat.name || remoteChat.chat_name || chatId,
        selected: current?.selected ?? true,
        source: "sync",
        createdAt: current?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const nextChats = Array.from(nextById.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    await writeJson(context.chatsFile, nextChats);
    sendJson(res, 200, { ok: true, imported: remoteChats.length, chats: nextChats });
    return;
  }

  if (url.pathname === "/api/broadcast" && req.method === "POST") {
    assertConfigured(context);
    const body = await readBody(req);
    const text = String(body.text || "").trim();
    const chatIds = Array.isArray(body.chatIds) ? body.chatIds.map(normalizeChatId) : [];

    if (!text) {
      sendJson(res, 400, { ok: false, error: "消息内容不能为空。" });
      return;
    }

    if (chatIds.length === 0) {
      sendJson(res, 400, { ok: false, error: "至少选择一个群。" });
      return;
    }

    const result = await broadcastText(context, chatIds, text);
    const logs = await readJson(context.logsFile, []);
    logs.unshift(result);
    await writeJson(context.logsFile, logs.slice(0, 200));
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (url.pathname === "/api/logs" && req.method === "GET") {
    sendJson(res, 200, { ok: true, logs: await readJson(context.logsFile, []) });
    return;
  }

  await serveStatic(url.pathname, res, context);
}

async function broadcastText(context, chatIds, text) {
  const config = getFeishuConfig(context);
  const startedAt = new Date().toISOString();
  const runId = randomUUID();
  const items = [];

  for (const chatId of chatIds) {
    const item = {
      chatId,
      ok: false,
      messageId: "",
      error: "",
      sentAt: new Date().toISOString()
    };

    try {
      const response = await sendTextMessage(context, chatId, text);
      item.ok = true;
      item.messageId = response.data?.message_id || "";
    } catch (error) {
      item.error = error.message || "发送失败";
    }

    items.push(item);
    await delay(config.sendIntervalMs);
  }

  return {
    id: runId,
    text,
    total: items.length,
    success: items.filter((item) => item.ok).length,
    failed: items.filter((item) => !item.ok).length,
    startedAt,
    finishedAt: new Date().toISOString(),
    items
  };
}

async function sendTextMessage(context, chatId, text) {
  const token = await getTenantAccessToken(context);
  return feishuFetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: "text",
      content: JSON.stringify({ text }),
      uuid: randomUUID()
    })
  });
}

async function listBotChats(context) {
  const token = await getTenantAccessToken(context);
  const items = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ page_size: "100" });
    if (pageToken) params.set("page_token", pageToken);

    const response = await feishuFetch(`https://open.feishu.cn/open-apis/im/v1/chats?${params}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });

    items.push(...(response.data?.items || []));
    pageToken = response.data?.page_token || "";
  } while (pageToken);

  return items;
}

async function getTenantAccessToken(context) {
  const config = getFeishuConfig(context);
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt - 60_000 > now) {
    return tokenCache.token;
  }

  const response = await feishuFetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  });

  tokenCache = {
    token: response.tenant_access_token,
    expiresAt: now + Number(response.expire || 7200) * 1000
  };

  return tokenCache.token;
}

async function feishuFetch(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.code !== 0) {
    const message = data.msg || data.error?.message || response.statusText || "Feishu API error";
    throw new Error(`${message}${data.code ? ` (code ${data.code})` : ""}`);
  }

  return data;
}

async function serveStatic(pathname, res, context) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    sendText(res, 403, "Forbidden");
    return;
  }

  const filePath = join(context.publicDir, normalizedPath);
  if (!existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }

  const content = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream"
  });
  res.end(content);
}

async function ensureStore(context) {
  await mkdir(context.dataDir, { recursive: true });
  if (!existsSync(context.chatsFile)) await writeJson(context.chatsFile, []);
  if (!existsSync(context.logsFile)) await writeJson(context.logsFile, []);
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }

  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("请求体必须是 JSON。");
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function createContext(options) {
  const rootDir = options.rootDir || process.env.FEISHU_ROOT_DIR || defaultRootDir;
  const publicDir = options.publicDir || join(rootDir, "public");
  const dataDir = options.dataDir || process.env.FEISHU_DATA_DIR || join(rootDir, "data");
  const configPath = options.configPath || process.env.FEISHU_CONFIG_PATH || join(rootDir, ".env");
  const config = loadEnv(configPath);
  const port = Number(options.port || process.env.PORT || config.PORT || 8787);

  return {
    rootDir,
    publicDir,
    dataDir,
    configPath,
    port,
    chatsFile: join(dataDir, "chats.json"),
    logsFile: join(dataDir, "logs.json")
  };
}

function loadEnv(filePath) {
  if (!existsSync(filePath)) return {};

  const parsed = {};
  const lines = readFileSync(filePath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    parsed[key] = value;
  }
  return parsed;
}

async function writeEnvFile(filePath, config) {
  await mkdir(dirname(filePath), { recursive: true });
  const lines = [
    "FEISHU_APP_ID=" + config.FEISHU_APP_ID,
    "FEISHU_APP_SECRET=" + config.FEISHU_APP_SECRET,
    "PORT=" + config.PORT,
    "SEND_INTERVAL_MS=" + config.SEND_INTERVAL_MS
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
}

function normalizeConfigInput(body, existingConfig) {
  const appId = String(body.appId || "").trim();
  const appSecret = String(body.appSecret || "").trim() || existingConfig.appSecret;
  const port = Number(body.port || 8787);
  const sendIntervalMs = Number(body.sendIntervalMs || 350);

  if (!/^cli_[A-Za-z0-9]+$/.test(appId)) {
    throw new Error("App ID 格式不正确，应为 cli_xxx。");
  }

  if (!appSecret) {
    throw new Error("App Secret 不能为空。");
  }

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("端口必须是 1024 到 65535 之间的整数。");
  }

  if (!Number.isInteger(sendIntervalMs) || sendIntervalMs < 0) {
    throw new Error("发送间隔必须是非负整数。");
  }

  return {
    FEISHU_APP_ID: appId,
    FEISHU_APP_SECRET: appSecret,
    PORT: String(port),
    SEND_INTERVAL_MS: String(sendIntervalMs)
  };
}

function normalizeChatId(value) {
  const chatId = String(value || "").trim();
  if (!/^oc_[A-Za-z0-9_-]+$/.test(chatId)) {
    throw new Error("群 ID 格式不正确，应为 oc_xxx。");
  }
  return chatId;
}

function assertConfigured(context) {
  const config = getFeishuConfig(context);
  if (config.missing.length > 0) {
    throw new Error(`请先在设置中配置 ${config.missing.join(" 和 ")}。`);
  }
}

function getFeishuConfig(context) {
  const latestEnv = loadEnv(context.configPath);
  const appId = process.env.FEISHU_APP_ID || latestEnv.FEISHU_APP_ID || "";
  const appSecret = process.env.FEISHU_APP_SECRET || latestEnv.FEISHU_APP_SECRET || "";
  const port = Number(process.env.PORT || latestEnv.PORT || context.port || 8787);
  const sendIntervalMs = Number(process.env.SEND_INTERVAL_MS || latestEnv.SEND_INTERVAL_MS || 350);
  const missing = [];

  if (!appId) missing.push("FEISHU_APP_ID");
  if (!appSecret) missing.push("FEISHU_APP_SECRET");

  return { appId, appSecret, port, sendIntervalMs, missing };
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(value));
}

function sendText(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
