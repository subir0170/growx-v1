// content-telegram.js
console.log("[GrowUp] Telegram Content Script Ready");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    sendResponse({ status: "alive" });
    return true;
  }

  if (request.action === "SCAN_TELEGRAM_LINKS") {
    scanTelegramLinks()
      .then(result => sendResponse(result))
      .catch(err => {
        console.error(err);
        sendResponse({ success: false, links: [], oldCount: 0 });
      });
    return true;
  }
});

async function scanTelegramLinks() {
  console.log("Scanning Telegram group for X links (last 5 hours)...");

  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  const links = [];
  let consecutiveOld = 0;

  // Telegram Web-এর মেসেজ সিলেক্টর (বর্তমান)
  const messages = document.querySelectorAll(
    "div.message, div.bubble, div[data-message-id], .chat-message, .message-list-item"
  );

  for (const msg of messages) {
    if (msg.dataset.growupScanned === "1") continue;
    msg.dataset.growupScanned = "1";

    // সময় বের করার চেষ্টা
    let msgTime = Date.now();
    const timeEl = msg.querySelector("time, .time, [class*='time'], .message-time");
    if (timeEl) {
      const raw = timeEl.getAttribute("title") || 
                  timeEl.getAttribute("datetime") || 
                  timeEl.innerText || "";
      const parsed = Date.parse(raw);
      if (!isNaN(parsed)) {
        msgTime = parsed;
      }
    }

    // ৫ ঘণ্টার বেশি পুরনো কিনা
    if (msgTime < fiveHoursAgo) {
      consecutiveOld++;
      if (consecutiveOld >= 2) {
        console.log("Found 2 consecutive old messages → stop collecting");
        break;
      }
      continue;
    } else {
      consecutiveOld = 0;
    }

    // X / Twitter লিংক খুঁজে বের করা
    const anchors = msg.querySelectorAll("a[href*='x.com/'], a[href*='twitter.com/']");

    for (const a of anchors) {
      let href = (a.href || "").trim();
      if (!href) continue;

      // শুধু status লিংক
      if (!/\/status\/\d+/.test(href)) continue;

      // ক্লিন URL
      href = href.split("?")[0].split("#")[0];

      // Username বের করা
      let username = "unknown";
      const match = href.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/\d+/);
      if (match && match[1]) {
        username = match[1];
      }

      links.push({
        x_url: href,
        username: username,
        post_text: (msg.innerText || "").slice(0, 280)
      });
    }

    // সর্বোচ্চ ১০টা লিংক
    if (links.length >= 10) break;
  }

  // Unique করা
  const unique = [];
  const seen = new Set();
  for (const item of links) {
    if (!seen.has(item.x_url)) {
      seen.add(item.x_url);
      unique.push(item);
    }
  }

  console.log(`Found ${unique.length} unique X links`);

  // একটু স্ক্রল (নতুন মেসেজ লোডের জন্য)
  window.scrollBy({ top: -400, behavior: "smooth" }); // উপরে স্ক্রল (নতুন মেসেজ সাধারণত উপরে)
  await new Promise(r => setTimeout(r, 800));

  return {
    success: true,
    links: unique,
    oldCount: consecutiveOld,
    count: unique.length
  };
}