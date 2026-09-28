console.log("GrowUp X Automation Content Script Active.");

let isAutomationRunning = false;

// ব্যাকগ্রাউন্ড বা প্যানেল থেকে মেসেজ শোনা
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_AUTOMATION") {
    isAutomationRunning = true;
    startFeedAutomation();
    sendResponse({ status: "automation_started" });
  } else if (request.action === "STOP_AUTOMATION") {
    isAutomationRunning = false;
    sendResponse({ status: "automation_stopped" });
  }
  return true;
});

async function startFeedAutomation() {
  console.log("Starting X Feed Automation Loop...");

  while (isAutomationRunning) {
    try {
      // ফিডের পোস্টগুলো খুঁজে বের করা
      const posts = document.querySelectorAll('article[data-testid="tweet"]');
      
      let targetPost = null;
      for (let post of posts) {
        // যে পোস্টে ইতিমধ্যে কাজ করা হয়নি (ডুপ্লিকেট চেক)
        if (post.getAttribute('data-auto-processed') !== 'true') {
          targetPost = post;
          break;
        }
      }

      if (!targetPost) {
        console.log("No new unprocessed posts found. Scrolling down to load more...");
        window.scrollBy(0, 800);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // পোস্ট প্রসেস করা শুরু
      targetPost.setAttribute('data-auto-processed', 'true');
      targetPost.style.border = "2px solid green"; // ডিবাগিংয়ের জন্য মার্ক করা

      // ১. পোস্টের টেক্সট ও লিংক সংগ্রহ
      const textElement = targetPost.querySelector('[data-testid="tweetText"]');
      const post_text = textElement ? textElement.innerText : "";
      
      let x_url = "";
      const links = targetPost.querySelectorAll('a');
      for (let link of links) {
        if (link.href && link.href.includes('/status/')) {
          x_url = link.href;
          break;
        }
      }

      if (x_url) {
        console.log("Processing post:", x_url);

        // ২. ব্যাকএন্ডে পোস্ট পাঠানো এবং এআই কমেন্ট আনা
        const res = await fetch('http://127.0.0.1:9999/api/queue/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            x_username: "AutoUser",
            x_url: x_url,
            post_text: post_text
          })
        });

        // ব্যাকএন্ড থেকে বা এআই থেকে কমেন্ট রেডি করিয়ে নেওয়া
        // (ধরে নিচ্ছি ব্যাকএন্ড বা জেমিনি থেকে রেসপন্স আসবে)
        await new Promise(resolve => setTimeout(resolve, 2000));

        // ৩. লাইক বা রিঅ্যাক্ট করা (Like Button Click)
        const likeBtn = targetPost.querySelector('[data-testid="like"]');
        if (likeBtn && !likeBtn.getAttribute('aria-pressed') === 'true') {
          likeBtn.click();
          console.log("Liked the post.");
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // ৪. কমেন্ট বক্স ওপেন করা (Reply/Comment Button Click)
        const replyBtn = targetPost.querySelector('[data-testid="reply"]');
        if (replyBtn) {
          replyBtn.click();
          console.log("Opened comment box.");
          
          // কমেন্ট বক্স লোড হওয়ার জন্য ২ সেকেন্ড অপেক্ষা
          await new Promise(resolve => setTimeout(resolve, 2000));

          // কমেন্ট ইনপুট ফিল্ডে এআই কমেন্ট টাইপ করা
          const commentBox = document.querySelector('[data-testid="tweetTextarea_0"]');
          if (commentBox) {
            // ডিফল্ট বা এআই জেনারেটেড কমেন্ট
            const aiCommentText = "Great insights! Thanks for sharing."; 
            
            commentBox.focus();
            document.execCommand('insertText', false, aiCommentText);
            console.log("Typed AI comment.");
            await new Promise(resolve => setTimeout(resolve, 1500));

            // কমেন্ট পোস্ট বা রিলাই বাটন ক্লিক করা
            const submitBtn = document.querySelector('[data-testid="tweetButton"]');
            if (submitBtn) {
              submitBtn.click();
              console.log("Comment submitted successfully!");
            }
          }
        }
      }

      // ৫. পরবর্তী পোস্টে যাওয়ার আগে ৫ সেকেন্ড বিরতি (Break) নেওয়া
      console.log("Waiting for 5 seconds before the next post...");
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (err) {
      console.error("Error in automation loop:", err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log("Automation Stopped.");
}