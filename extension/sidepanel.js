const BASE_URL = "http://127.0.0.1:9999/api";

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  initAutomationButton();
  setInterval(updateAutomationUI, 2500); // live status polling

  // Auth tabs
  const showLoginBtn = document.getElementById("show-login");
  const showRegisterBtn = document.getElementById("show-register");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  showLoginBtn?.addEventListener("click", () => {
    loginForm.style.display = "block";
    registerForm.style.display = "none";
    showLoginBtn.classList.add("active");
    showRegisterBtn.classList.remove("active");
  });

  showRegisterBtn?.addEventListener("click", () => {
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    showRegisterBtn.classList.add("active");
    showLoginBtn.classList.remove("active");
  });

  // Login
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    try {
      const res = await fetch(`${BASE_URL}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        checkAuth();
      } else {
        errorEl.textContent = data.error || "Login failed";
      }
    } catch (err) {
      errorEl.textContent = "Server connection error. Is Django running?";
    }
  });

  // Register
  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const full_name = document.getElementById("reg-name").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    const confirm_password = document.getElementById("reg-confirm").value;
    const errorEl = document.getElementById("reg-error");

    try {
      const res = await fetch(`${BASE_URL}/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name, email, password, confirm_password }),
        credentials: "include"
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert("Registered successfully! Please login.");
        showLoginBtn.click();
      } else {
        errorEl.textContent = data.error || "Registration failed";
      }
    } catch (err) {
      errorEl.textContent = "Server connection error.";
    }
  });

  // Logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch(`${BASE_URL}/logout/`, { method: "POST", credentials: "include" });
    checkAuth();
  });

  // Navigation
  document.querySelectorAll(".nav-btn[data-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view").forEach((v) => (v.style.display = "none"));
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

      const target = btn.getAttribute("data-target");
      document.getElementById(target).style.display = "block";
      btn.classList.add("active");

      if (target === "dashboard-view") {
        loadDashboard();
        updateAutomationUI();
      }
      if (target === "account-view") loadAccount();
      if (target === "queue-view") loadQueue();
      if (target === "history-view") loadHistory();
      if (target === "settings-view") loadSettings();
    });
  });

  // Save X
  document.getElementById("save-x")?.addEventListener("click", async () => {
    const username = document.getElementById("x-username").value;
    await fetch(`${BASE_URL}/account/x/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
      credentials: "include"
    });
    loadAccount();
  });

  // Save Telegram
  document.getElementById("save-telegram")?.addEventListener("click", async () => {
    const username = document.getElementById("telegram-username").value;
    await fetch(`${BASE_URL}/account/telegram/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
      credentials: "include"
    });
    loadAccount();
  });

  // Add to Queue
  document.getElementById("add-queue-btn")?.addEventListener("click", async () => {
    const x_username = document.getElementById("q-username").value;
    const x_url = document.getElementById("q-url").value;
    const post_text = document.getElementById("q-text").value;

    const res = await fetch(`${BASE_URL}/queue/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x_username, x_url, post_text }),
      credentials: "include"
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("q-username").value = "";
      document.getElementById("q-url").value = "";
      document.getElementById("q-text").value = "";
      loadQueue();
    } else {
      alert(data.error || "Failed to add");
    }
  });

  // Save Settings
  document.getElementById("save-settings")?.addEventListener("click", async () => {
    const name = document.getElementById("set-name").value;
    const role = document.getElementById("set-role").value;
    const tone = document.getElementById("set-tone").value;
    const custom_prompt = document.getElementById("set-prompt").value;

    await fetch(`${BASE_URL}/settings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role, tone, custom_prompt }),
      credentials: "include"
    });
    alert("Settings saved!");
  });
});

/* ========== Automation ========== */
function initAutomationButton() {
  const btn = document.getElementById("toggle-automation-btn");
  if (!btn) return;

  // Prevent duplicate listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "GET_STATUS" }, (res) => {
      const action = res?.isRunning ? "STOP_AUTOMATION" : "START_AUTOMATION";
      chrome.runtime.sendMessage({ action }, () => {
        updateAutomationUI();
      });
    });
  });
}

function updateAutomationUI() {
  chrome.runtime.sendMessage({ action: "GET_STATUS" }, (res) => {
    if (!res) return;

    const btn = document.getElementById("toggle-automation-btn");
    const statusEl = document.getElementById("auto-status");
    const countEl = document.getElementById("processed-count");
    const errEl = document.getElementById("last-error");
    const dot = document.getElementById("status-dot");

    if (btn) {
      if (res.isRunning) {
        btn.innerHTML = `<i class="fa-solid fa-stop"></i> Stop`;
        btn.classList.add("running");
      } else {
        btn.innerHTML = `<i class="fa-solid fa-play"></i> Start`;
        btn.classList.remove("running");
      }
    }

    if (statusEl) statusEl.textContent = res.isRunning ? "Running" : "Stopped";
    if (countEl) countEl.textContent = res.processed || 0;
    if (errEl) errEl.textContent = res.lastError || "—";

    if (dot) {
      dot.classList.toggle("running", !!res.isRunning);
      dot.classList.toggle("stopped", !res.isRunning);
    }
  });
}

/* ========== Auth & Data Loaders ========== */
async function checkAuth() {
  try {
    const res = await fetch(`${BASE_URL}/me/`, { credentials: "include" });
    const data = await res.json();
    const auth = document.getElementById("auth-container");
    const app = document.getElementById("app-container");

    if (data.is_authenticated) {
      auth.style.display = "none";
      app.style.display = "block";
      loadDashboard();
      updateAutomationUI();
    } else {
      auth.style.display = "block";
      app.style.display = "none";
    }
  } catch (err) {
    console.error("Auth check failed:", err);
  }
}

async function loadDashboard() {
  try {
    const res = await fetch(`${BASE_URL}/dashboard/`, { credentials: "include" });
    const data = await res.json();

    document.getElementById("welcome-user").textContent = `Hello, ${data.full_name || "User"}`;
    document.getElementById("stat-total-posts").textContent = data.total_posts || 0;
    document.getElementById("stat-total-responses").textContent = data.total_responses || 0;
    document.getElementById("stat-completed").textContent = data.completed || 0;
    document.getElementById("stat-pending").textContent = data.pending || 0;

    const list = document.getElementById("recent-activity-list");
    if (data.recent_activity?.length) {
      list.innerHTML = data.recent_activity
        .map(
          (item) => `
        <div class="list-item">
          <strong>@${item.x_username}</strong> · ${item.status}
          <br><small>${new Date(item.created_at).toLocaleString()}</small>
        </div>`
        )
        .join("");
    } else {
      list.innerHTML = `<div class="list-item"><p>No recent activity yet.</p></div>`;
    }
  } catch (err) {
    console.error("Dashboard error:", err);
  }
}

async function loadAccount() {
  try {
    const resX = await fetch(`${BASE_URL}/account/x/`, { credentials: "include" });
    const dataX = await resX.json();
    document.getElementById("x-username").value = dataX.username || "";
    document.getElementById("x-status").textContent = dataX.status || "Disconnected";

    const resTg = await fetch(`${BASE_URL}/account/telegram/`, { credentials: "include" });
    const dataTg = await resTg.json();
    document.getElementById("telegram-username").value = dataTg.username || "";
    document.getElementById("telegram-status").textContent = dataTg.status || "Disconnected";
  } catch (err) {
    console.error(err);
  }
}

async function loadQueue() {
  try {
    const res = await fetch(`${BASE_URL}/queue/`, { credentials: "include" });
    const data = await res.json();
    const list = document.getElementById("queue-list");

    if (!data.queue?.length) {
      list.innerHTML = `<div class="list-item"><p>Queue is empty.</p></div>`;
      return;
    }

    list.innerHTML = data.queue
      .map(
        (item) => `
      <div class="list-item">
        <strong>@${item.x_username}</strong> <span style="color:var(--text-muted)">· ${item.status}</span>
        <p>${item.post_text || ""}</p>
        <a href="${item.x_url}" target="_blank">View Post →</a>
        ${item.ai_response ? `<p style="color:#60a5fa;margin-top:6px"><em>AI: ${item.ai_response}</em></p>` : ""}
        <div class="list-actions">
          <button class="btn secondary-btn" onclick="handleQueueAction(${item.id}, 'generate')">Generate</button>
          <button class="btn primary-btn" onclick="handleQueueAction(${item.id}, 'complete')">Complete</button>
          <button class="btn secondary-btn" onclick="handleQueueAction(${item.id}, 'skip')">Skip</button>
        </div>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

window.handleQueueAction = async function (id, action) {
  await fetch(`${BASE_URL}/queue/${id}/${action}/`, {
    method: "POST",
    credentials: "include"
  });
  loadQueue();
};

async function loadHistory() {
  try {
    const res = await fetch(`${BASE_URL}/history/`, { credentials: "include" });
    const data = await res.json();
    const list = document.getElementById("history-list");

    if (!data.history?.length) {
      list.innerHTML = `<div class="list-item"><p>No history yet.</p></div>`;
      return;
    }

    list.innerHTML = data.history
      .map(
        (item) => `
      <div class="list-item">
        <strong>@${item.x_username}</strong>
        <p>${item.ai_response || ""}</p>
        <a href="${item.x_url}" target="_blank">View Post →</a>
        <br><small>${new Date(item.created_at).toLocaleString()}</small>
      </div>`
      )
      .join("");
  } catch (err) {
    console.error(err);
  }
}

async function loadSettings() {
  try {
    const res = await fetch(`${BASE_URL}/settings/`, { credentials: "include" });
    const data = await res.json();
    document.getElementById("set-name").value = data.name || "";
    document.getElementById("set-email").value = data.email || "";
    document.getElementById("set-role").value = data.role || "";
    document.getElementById("set-tone").value = data.tone || "";
    document.getElementById("set-prompt").value = data.custom_prompt || "";
  } catch (err) {
    console.error(err);
  }
}