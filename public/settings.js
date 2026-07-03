const form = document.querySelector("#settingsForm");
const appIdInput = document.querySelector("#appIdInput");
const appSecretInput = document.querySelector("#appSecretInput");
const portInput = document.querySelector("#portInput");
const sendIntervalInput = document.querySelector("#sendIntervalInput");
const saveButton = document.querySelector("#saveButton");
const statusElement = document.querySelector("#settingsStatus");

await loadConfig();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus("保存中");

  try {
    const data = await api("/api/config", {
      method: "POST",
      body: {
        appId: appIdInput.value.trim(),
        appSecret: appSecretInput.value.trim(),
        port: Number(portInput.value),
        sendIntervalMs: Number(sendIntervalInput.value)
      }
    });

    setStatus(data.restartRequired ? "已保存。端口修改会在重启程序后生效。" : "已保存");
  } finally {
    saveButton.disabled = false;
  }
});

async function loadConfig() {
  const data = await api("/api/config");
  appIdInput.value = data.config.appId || "";
  portInput.value = data.config.port || 8787;
  sendIntervalInput.value = data.config.sendIntervalMs || 350;
  appSecretInput.placeholder = data.config.hasAppSecret ? "已保存，重新输入可覆盖" : "输入 app_secret";
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
  statusElement.textContent = message;
}
