const state = {
  chats: [],
  selected: new Set(),
  logs: []
};

const elements = {
  configStatus: document.querySelector("#configStatus"),
  syncButton: document.querySelector("#syncButton"),
  selectAllButton: document.querySelector("#selectAllButton"),
  selectNoneButton: document.querySelector("#selectNoneButton"),
  chatList: document.querySelector("#chatList"),
  groupCount: document.querySelector("#groupCount"),
  selectedCount: document.querySelector("#selectedCount"),
  messageInput: document.querySelector("#messageInput"),
  sendButton: document.querySelector("#sendButton"),
  sendStatus: document.querySelector("#sendStatus"),
  refreshLogsButton: document.querySelector("#refreshLogsButton"),
  logList: document.querySelector("#logList")
};

await init();

async function init() {
  bindEvents();
  await Promise.all([loadHealth(), loadChats(), loadLogs()]);
}

function bindEvents() {
  elements.syncButton.addEventListener("click", syncChats);
  elements.selectAllButton.addEventListener("click", () => selectAll(true));
  elements.selectNoneButton.addEventListener("click", () => selectAll(false));
  elements.sendButton.addEventListener("click", sendBroadcast);
  elements.refreshLogsButton.addEventListener("click", loadLogs);
}

async function loadHealth() {
  const data = await api("/api/health");
  elements.configStatus.textContent = data.configured
    ? `已配置应用凭据，当前端口 ${data.port}，发送间隔 ${data.sendIntervalMs}ms`
    : `未完成配置：${data.missing.join("、")}`;
}

async function loadChats() {
  const data = await api("/api/chats");
  state.chats = data.chats;
  state.selected = new Set(data.chats.filter((chat) => chat.selected !== false).map((chat) => chat.chatId));
  renderChats();
}

async function loadLogs() {
  const data = await api("/api/logs");
  state.logs = data.logs;
  renderLogs();
}

async function syncChats() {
  elements.syncButton.disabled = true;
  elements.syncButton.textContent = "同步中";

  try {
    const data = await api("/api/chats/sync", { method: "POST" });
    state.chats = data.chats;
    state.selected = new Set(data.chats.filter((chat) => chat.selected !== false).map((chat) => chat.chatId));
    renderChats();
    setStatus(`已同步 ${data.imported} 个群`);
  } finally {
    elements.syncButton.disabled = false;
    elements.syncButton.textContent = "同步机器人所在群";
  }
}

function selectAll(checked) {
  state.selected = checked ? new Set(state.chats.map((chat) => chat.chatId)) : new Set();
  renderChats();
}

async function sendBroadcast() {
  const text = elements.messageInput.value.trim();
  const chatIds = Array.from(state.selected);

  if (!text) {
    setStatus("消息内容不能为空");
    return;
  }

  if (chatIds.length === 0) {
    setStatus("至少选择一个群");
    return;
  }

  const confirmed = window.confirm(`确认发送到 ${chatIds.length} 个群？`);
  if (!confirmed) return;

  elements.sendButton.disabled = true;
  setStatus("发送中");

  try {
    const data = await api("/api/broadcast", {
      method: "POST",
      body: { chatIds, text }
    });
    setStatus(`完成：成功 ${data.result.success}，失败 ${data.result.failed}`);
    await loadLogs();
  } finally {
    elements.sendButton.disabled = false;
  }
}

function renderChats() {
  elements.groupCount.textContent = `${state.chats.length} 个群`;
  elements.selectedCount.textContent = state.selected.size ? `已选择 ${state.selected.size} 个群` : "未选择群";

  if (state.chats.length === 0) {
    elements.chatList.innerHTML = `<div class="chat-item empty"><div><div class="chat-name">暂无群</div><div class="chat-id">点击“同步机器人所在群”获取群列表。</div></div></div>`;
    return;
  }

  elements.chatList.innerHTML = "";
  for (const chat of state.chats) {
    const item = document.createElement("div");
    item.className = "chat-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selected.has(chat.chatId);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selected.add(chat.chatId);
      } else {
        state.selected.delete(chat.chatId);
      }
      renderChats();
    });

    const info = document.createElement("div");
    info.innerHTML = `<div class="chat-name"></div><div class="chat-id"></div>`;
    info.querySelector(".chat-name").textContent = chat.name;
    info.querySelector(".chat-id").textContent = chat.chatId;

    item.append(checkbox, info);
    elements.chatList.append(item);
  }
}

function renderLogs() {
  if (state.logs.length === 0) {
    elements.logList.innerHTML = `<div class="log-item"><div class="log-meta">暂无发送记录</div></div>`;
    return;
  }

  elements.logList.innerHTML = "";
  for (const log of state.logs.slice(0, 20)) {
    const item = document.createElement("div");
    item.className = `log-item ${log.failed ? "fail" : "ok"}`;
    item.innerHTML = `
      <div class="chat-name"></div>
      <div class="log-meta"></div>
      <div class="log-detail"></div>
    `;
    item.querySelector(".chat-name").textContent = `成功 ${log.success}/${log.total}`;
    item.querySelector(".log-meta").textContent = `${formatTime(log.startedAt)} - ${formatTime(log.finishedAt)}`;
    item.querySelector(".log-detail").textContent = log.failed
      ? log.items.filter((entry) => !entry.ok).map((entry) => `${entry.chatId}: ${entry.error}`).join("；")
      : log.text;
    elements.logList.append(item);
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const message = data.error || response.statusText || "请求失败";
    setStatus(message);
    throw new Error(message);
  }
  return data;
}

function setStatus(message) {
  elements.sendStatus.textContent = message;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
