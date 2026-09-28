// background.js
let isRunning = false;
let processedCount = 0;
let lastError = null;
let loopTimeout = null;

let telegramQueue = [];          // Telegram থেকে পাওয়া লিংক
let isProcessingLink = false;    // একটা লিংক প্রসেস হচ্ছে কিনা
let consecutiveOldCount = 0;     // পরপর পুরনো লিংক কাউন্ট
let processingTabId = null;      // বর্তমানে engagement চলছে যে ট্যাবে

const API_BASE = "http://127.0.0.1:9999/api";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_AUTOMATION") {
    if (!isRunning) {
      isRunning = true;
      lastError = null;
      telegramQueue = [];
      isProcessingLink = false;
      consecutiveOldCount = 0;
      processingTabId = null;
      console.log("Automation Started");
      runLoop();
    }
    sendResponse({ status: "started", isRunning: true, processed: processedCount });
  } 
  else if (request.action === "STOP_AUTOMATION") {
    isRunning = false;
    if (loopTimeout) clearTimeout(loopTimeout);
    telegramQueue = [];
    isProcessingLink = false;
    processingTabId = null;
    console.log("Automation Stopped");
    sendResponse({ status: "stopped", isRunning: false, processed: processedCount });
  } 
  else if (request.action === "GET_STATUS") {
    sendResponse({
      isRunning,
      processed: processedCount,
      lastError
    });
  }
  return true;
});

async function runLoop() {
  if (!isRunning) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      scheduleNext(8000);
      return;
    }

    const url = tab.url || "";

    // ==================== TELEGRAM MODE ====================
    if (url.includes("web.telegram.org")) {
      console.log("→ Telegram Mode");

      await ensureContentScript(tab.id, "content-telegram.js");

      // Queue খালি থাকলে নতুন লিংক স্ক্যান করি
      if (telegramQueue.length === 0 && !isProcessingLink) {
        try {
          const result = await sendMessageWithRetry(tab.id, {
            action: "SCAN_TELEGRAM_LINKS"
          });

          if (result && result.links && result.links.length > 0) {
            telegramQueue = result.links;
            consecutiveOldCount = result.oldCount || 0;
            console.log(`Telegram: ${telegramQueue.length} unique links found`);

            // যদি ২টা পরপর পুরনো পায় → Stop
            if (consecutiveOldCount >= 2) {
              console.log("2 consecutive old messages → Auto Stopping");
              isRunning = false;
              lastError = "Stopped: Found old messages (>5 hours)";
              return;
            }
          } else {
            console.log("No new X links found");
            lastError = "No X links in last 5 hours";
          }
        } catch (e) {
          console.warn("Telegram scan error:", e.message);
          lastError = e.message;
        }
      }

      // Queue থেকে একটা করে প্রসেস
      if (telegramQueue.length > 0 && !isProcessingLink) {
        isProcessingLink = true;
        const item = telegramQueue.shift();
        await processTelegramLink(item);
        isProcessingLink = false;
        processingTabId = null;
      }
    }

    // ==================== X FEED / STATUS MODE ====================
    else if (url.includes("x.com") || url.includes("twitter.com")) {
      // যদি Telegram থেকে কোনো specific post প্রসেস হচ্ছে → সেই ট্যাবকে touch করবো না
      if (isProcessingLink) {
        // শুধু অপেক্ষা – redirect বা feed process করবো না
        console.log("→ Skipping X loop (Telegram link engagement in progress)");
        scheduleNext(4000);
        return;
      }

      // Status page হলে (Telegram flow ছাড়া) → home-এ পাঠাই
      if (url.includes("/status/")) {
        console.log("→ Status page detected (not from Telegram) → going to home");
        await chrome.tabs.update(tab.id, { url: "https://x.com/home" });
        await sleep(4000);
        scheduleNext(5000);
        return;
      }

      // Home / root feed
      if (
        url.includes("/home") ||
        url === "https://x.com/" ||
        url === "https://twitter.com/" ||
        url.includes("x.com/?") ||
        url.includes("twitter.com/?")
      ) {
        await ensureContentScript(tab.id, "content-x.js");

        try {
          const result = await sendMessageWithRetry(tab.id, {
            action: "PROCESS_ONE_POST_FROM_FEED"
          });

          if (result && result.success) {
            processedCount++;
            console.log("✅ Feed engagement success. Total:", processedCount);
            lastError = null;
          } else {
            await sendMessageWithRetry(tab.id, { action: "SCROLL_FEED" });
          }
        } catch (e) {
          lastError = e.message;
        }
      } else {
        // অন্য পেজে থাকলে Home-এ পাঠাই
        await chrome.tabs.update(tab.id, { url: "https://x.com/home" });
        await sleep(4000);
      }
    }

  } catch (err) {
    lastError = err.message;
    console.error("Loop error:", err);
  }

  scheduleNext(11000 + Math.random() * 6000);
}

// ========== Telegram লিংক প্রসেস ==========
async function processTelegramLink(item) {
  let newTab = null;
  try {
    console.log("Processing Telegram link:", item.x_url);

    // 1. DB-তে সেভ (Unique check backend করে)
    const saveRes = await fetch(`${API_BASE}/queue/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        x_username: item.username || "unknown",
        x_url: item.x_url,
        post_text: item.post_text || ""
      })
    });

    const saveData = await saveRes.json().catch(() => ({}));

    // Already exists হলে স্কিপ
    if (!saveRes.ok || (saveData.error && String(saveData.error).toLowerCase().includes("already"))) {
      console.log("Already exists in DB → skipped");
      return;
    }

    // 2. নতুন ট্যাবে X লিংক ওপেন (active রাখি যাতে human-like interaction ঠিকমতো হয়)
    newTab = await chrome.tabs.create({
      url: item.x_url,
      active: true
    });
    processingTabId = newTab.id;

    // লোড হওয়া পর্যন্ত অপেক্ষা
    await waitForTabLoad(newTab.id);
    await sleep(5000 + Math.random() * 2500);

    // Content script inject
    const injected = await ensureContentScript(newTab.id, "content-x.js");
    if (!injected) {
      console.warn("Content script inject failed on status page");
      lastError = "Content script inject failed on status page";
      return;
    }

    // 3. Engagement – শুধু এই specific post-এর উপর
    const engageRes = await sendMessageWithRetry(newTab.id, {
      action: "PERFORM_ENGAGEMENT_ON_POST",
      targetUrl: item.x_url          // exact URL পাঠাই যাতে শুধু এই post-ই target হয়
    }, 4);

    if (engageRes && engageRes.success) {
      processedCount++;
      console.log("✅ Engaged from Telegram link. Total:", processedCount);
      lastError = null;

      // complete মার্ক
      try {
        const pendingRes = await fetch(`${API_BASE}/queue/pending/`, {
          credentials: "include"
        });
        const pendingData = await pendingRes.json();
        if (pendingData?.next_item?.id) {
          await fetch(`${API_BASE}/queue/${pendingData.next_item.id}/complete/`, {
            method: "POST",
            credentials: "include"
          });
        }
      } catch (e) {
        console.warn("Complete mark failed:", e.message);
      }
    } else {
      console.warn("Engagement failed:", engageRes?.error || engageRes?.message || "unknown");
      lastError = engageRes?.error || engageRes?.message || "Engagement failed on Telegram link";
    }

  } catch (err) {
    console.error("processTelegramLink error:", err);
    lastError = err.message;
  } finally {
    // 4. ট্যাব ক্লোজ (সবসময়)
    if (newTab && newTab.id) {
      await sleep(1500 + Math.random() * 1000);
      try {
        await chrome.tabs.remove(newTab.id);
      } catch (e) {}
    }
    processingTabId = null;
    await sleep(1200);
  }
}

// ================== Helper Functions ==================

function scheduleNext(ms) {
  if (!isRunning) return;
  if (loopTimeout) clearTimeout(loopTimeout);
  loopTimeout = setTimeout(runLoop, ms);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 18000);
  });
}

async function ensureContentScript(tabId, file = "content-x.js") {
  try {
    await chrome.tabs.sendMessage(tabId, { action: "PING" });
    return true;
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [file]
      });
      await sleep(1200);
      return true;
    } catch (err) {
      console.error("Inject failed:", err);
      lastError = "Content script inject failed";
      return false;
    }
  }
}

async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      console.warn(`Attempt ${i + 1} failed:`, err.message);
      if (i < maxRetries - 1) {
        await ensureContentScript(tabId, message.action?.includes("TELEGRAM") ? "content-telegram.js" : "content-x.js");
        await sleep(1400);
      } else {
        throw err;
      }
    }
  }
}