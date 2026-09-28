// content-x.js
console.log("[GrowUp] Stable Version Loaded - gemini-2.5-flash");

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const processedUrls = new Set();

// ===== Fake Cursor =====
const SHOW_CURSOR = true;
let fakeCursor = null;

function createFakeCursor() {
  if (fakeCursor || !SHOW_CURSOR) return;
  fakeCursor = document.createElement("div");
  fakeCursor.style.cssText = `
    position: fixed;
    width: 14px;
    height: 14px;
    background: #3b82f6;
    border-radius: 50%;
    pointer-events: none;
    z-index: 999999;
    transform: translate(-50%, -50%);
    opacity: 0.75;
    box-shadow: 0 0 8px rgba(59,130,246,0.6);
    display: none;
  `;
  document.body.appendChild(fakeCursor);
}

function showCursor(x, y) {
  if (!SHOW_CURSOR) return;
  createFakeCursor();
  fakeCursor.style.display = "block";
  fakeCursor.style.left = x + "px";
  fakeCursor.style.top = y + "px";
}

function hideCursor() {
  if (fakeCursor) fakeCursor.style.display = "none";
}

// ===== Human-like click =====
async function humanClick(el) {
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  await sleep(500 + Math.random() * 400);

  const rect = el.getBoundingClientRect();
  const x = rect.left + rect.width / 2 + (Math.random() * 4 - 2);
  const y = rect.top + rect.height / 2 + (Math.random() * 4 - 2);

  showCursor(x, y);
  await sleep(200 + Math.random() * 200);

  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: x, clientY: y }));
  await sleep(80 + Math.random() * 120);
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
  await sleep(40 + Math.random() * 60);
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
  el.click();

  await sleep(300 + Math.random() * 300);
  return true;
}

// ===== Message Listener =====
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "PING") {
    sendResponse({ status: "alive" });
    return true;
  }

  if (req.action === "PROCESS_ONE_POST_FROM_FEED") {
    processOnePost({ fromFeed: true })
      .then(res => sendResponse(res))
      .catch(err => {
        console.error(err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (req.action === "SCROLL_FEED") {
    forceScroll().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (req.action === "PERFORM_ENGAGEMENT_ON_POST") {
    // Telegram থেকে খোলা specific status page-এর জন্য
    // targetUrl থাকলে শুধু সেই post-ই target করব
    processOnePost({
      fromFeed: false,
      targetUrl: req.targetUrl || null
    })
      .then(res => sendResponse(res))
      .catch(err => {
        console.error(err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

// ====================== মূল লজিক ======================

async function processOnePost(options = {}) {
  const { fromFeed = true, targetUrl = null } = options;

  closeEverything();
  await sleep(700);

  const articles = [...document.querySelectorAll('article[data-testid="tweet"]')];

  // Status page-এ সাধারণত প্রথম article-ই মূল post
  // targetUrl থাকলে সেটার সাথে মিলিয়ে নেই
  for (const article of articles) {
    try {
      if (article.dataset.growupDone === "1") continue;

      if (isReply(article)) {
        article.dataset.growupDone = "1";
        continue;
      }

      const url = getStatusUrl(article);
      if (!url) {
        article.dataset.growupDone = "1";
        continue;
      }

      // Telegram mode: শুধু targetUrl-এর post প্রসেস করব
      if (targetUrl) {
        const cleanTarget = targetUrl.split("?")[0].split("#")[0];
        const cleanUrl = url.split("?")[0].split("#")[0];
        if (cleanUrl !== cleanTarget && !cleanUrl.includes(cleanTarget.split("/status/")[1])) {
          // এই article target না → স্কিপ
          continue;
        }
      } else {
        // Feed mode
        if (processedUrls.has(url)) {
          article.dataset.growupDone = "1";
          continue;
        }
        if (!isRecent(article)) {
          article.dataset.growupDone = "1";
          continue;
        }
      }

      // ===== এই পোস্ট প্রসেস করব =====
      processedUrls.add(url);
      article.dataset.growupDone = "1";
      article.style.outline = "2px solid #22c55e";

      const postText = article.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || "";
      const username = getUsername(article) || "unknown";

      console.log("→ Processing:", url, fromFeed ? "(feed)" : "(telegram/status)");

      // AI Comment আনো (polling সহ)
      let comment = await getAIComment(username, url, postText);
      comment = forceShort(comment);

      // 1. Like
      const likeBtn = article.querySelector('[data-testid="like"]');
      if (likeBtn && likeBtn.getAttribute("aria-pressed") !== "true") {
        await humanClick(likeBtn);
        console.log("  Liked");
        await sleep(900 + Math.random() * 600);
      } else {
        console.log("  Already liked or no like button");
      }

      // 2. Reply
      const replyBtn = article.querySelector('[data-testid="reply"]');
      if (!replyBtn) {
        console.warn("  Reply button missing");
        if (fromFeed) {
          await forceScroll();
        }
        return { success: false, error: "Reply button missing" };
      }

      await humanClick(replyBtn);
      await sleep(1800 + Math.random() * 1000);

      // 3. Type comment
      const textarea = await waitForElement('[data-testid="tweetTextarea_0"]', 5000);
      if (!textarea) {
        closeEverything();
        if (fromFeed) await forceScroll();
        return { success: false, error: "Comment textarea not found" };
      }

      await humanType(textarea, comment);
      console.log("  Comment:", comment);
      await sleep(900 + Math.random() * 500);

      // 4. Submit
      const submitBtn = document.querySelector('[data-testid="tweetButton"]') ||
                        document.querySelector('[data-testid="tweetButtonInline"]');

      if (submitBtn && !submitBtn.disabled) {
        await humanClick(submitBtn);
        console.log("  ✅ Submitted");
        await sleep(2200 + Math.random() * 1000);
      } else {
        console.warn("  Submit button missing or disabled");
      }

      closeEverything();
      hideCursor();
      await sleep(800);

      // Feed mode-এ শুধু complete মার্ক + scroll
      if (fromFeed) {
        markComplete();
        await forceScroll(true);
      }

      return { success: true, x_url: url, comment };

    } catch (err) {
      console.error("Post process error:", err);
      closeEverything();
      hideCursor();
    }
  }

  hideCursor();
  if (fromFeed) {
    await forceScroll();
  }
  return { success: false, message: "No eligible post found" };
}

// ====================== Helper Functions ======================

function isReply(article) {
  if (article.querySelector('[data-testid="socialContext"]')) return true;
  const text = article.innerText.toLowerCase();
  if (text.includes("replying to") || text.includes("replied to")) return true;
  return false;
}

function getStatusUrl(article) {
  const links = article.querySelectorAll('a[href*="/status/"]');
  for (const a of links) {
    if (/\/status\/\d+/.test(a.href)) {
      return a.href.split("?")[0];
    }
  }
  return null;
}

function getUsername(article) {
  const el = article.querySelector('[data-testid="User-Name"] a[href^="/"]');
  if (el) {
    const parts = el.getAttribute("href").split("/").filter(Boolean);
    return parts[0] || null;
  }
  return null;
}

function isRecent(article) {
  const time = article.querySelector("time");
  if (!time) return true;
  const dt = time.getAttribute("datetime");
  if (!dt) return true;
  return Date.now() - new Date(dt).getTime() <= FIVE_HOURS_MS;
}

// ========== উন্নত getAIComment (Polling সহ) ==========
async function getAIComment(username, url, text) {
  try {
    // 1. Queue-তে যোগ করো
    const postRes = await fetch("http://127.0.0.1:9999/api/queue/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ x_username: username, x_url: url, post_text: text })
    });

    if (!postRes.ok) {
      console.warn("[AI] Queue POST failed:", postRes.status);
      return getRandomFallback();
    }

    // 2. Poll করে ai_response আসা পর্যন্ত অপেক্ষা (max ~10 সেকেন্ড)
    const maxAttempts = 10;
    for (let i = 0; i < maxAttempts; i++) {
      await sleep(1000 + Math.random() * 400);

      const res = await fetch("http://127.0.0.1:9999/api/queue/pending/", {
        credentials: "include"
      });
      const data = await res.json();

      if (data?.next_item?.ai_response) {
        const ai = data.next_item.ai_response.trim();
        console.log("[AI] Got Gemini response:", ai);
        return ai;
      }

      console.log(`[AI] Waiting for response... attempt ${i + 1}/${maxAttempts}`);
    }

    console.warn("[AI] Timeout – no ai_response received");
  } catch (e) {
    console.error("[AI] getAIComment error:", e);
  }

  return getRandomFallback();
}

function getRandomFallback() {
  const fallbacks = [
    "This perspective is quite useful.",
    "Appreciate the clear explanation.",
    "Solid reasoning behind this point.",
    "Helpful insight on the topic.",
    "Well thought out observation.",
    "Good breakdown of the issue.",
    "Valuable point raised here."
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

async function markComplete() {
  try {
    const res = await fetch("http://127.0.0.1:9999/api/queue/pending/", { credentials: "include" });
    const data = await res.json();
    if (data?.next_item?.id) {
      await fetch(`http://127.0.0.1:9999/api/queue/${data.next_item.id}/complete/`, {
        method: "POST",
        credentials: "include"
      });
    }
  } catch (e) {}
}

function forceShort(text) {
  if (!text) return getRandomFallback();
  let words = text.trim().split(/\s+/);
  if (words.length > 10) words = words.slice(0, 10);
  let r = words.join(" ");
  if (!/[.!?]$/.test(r)) r += ".";
  return r;
}

function closeEverything() {
  for (let i = 0; i < 3; i++) {
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", keyCode: 27, bubbles: true
    }));
  }
  const closeBtn = document.querySelector('[data-testid="app-bar-close"]');
  if (closeBtn) closeBtn.click();
}

async function forceScroll(strong = false) {
  const amount = strong ? 1200 + Math.random() * 600 : 900 + Math.random() * 500;
  window.scrollBy({ top: amount, behavior: "smooth" });
  await sleep(1500 + Math.random() * 800);
  window.scrollBy({ top: 400 + Math.random() * 300, behavior: "smooth" });
  await sleep(1000 + Math.random() * 600);
}

async function humanType(el, text) {
  el.focus();
  await sleep(150);
  document.execCommand("selectAll", false, null);
  document.execCommand("delete", false, null);
  await sleep(100);

  for (const char of text) {
    document.execCommand("insertText", false, char);
    await sleep(30 + Math.random() * 50);
  }
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearInterval(timer);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(null);
      }
    }, 100);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}