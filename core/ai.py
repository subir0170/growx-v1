import os
import random
import time
from django.conf import settings
from google import genai
from google.genai import types


def generate_ai_response(post_text, username, role="Professional", tone="Friendly", custom_prompt=None, image_url=None):
    """
    Gemini 3.6 Flash দিয়ে কমেন্ট জেনারেট করে।
    503 / 429 Error হলে retry করবে।
    """
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise Exception("GEMINI_API_KEY not set")

        # ডিবাগ (চাইলে পরে মুছে দিতে পারো)
        print(f"[DEBUG] Using API Key: {api_key[:8]}...{api_key[-4:]}")

        client = genai.Client(api_key=api_key)
        model_name = getattr(settings, "GEMINI_MODEL", "gemini-3.6-flash")

        prompt = f"""
You are a real professional user on X (Twitter).

Write a short natural reply to the post.

STRICT RULES:
- 6 to 10 words only
- Must be relevant to the post content
- No emojis, no hashtags, no links
- Never use: "Clear and valuable insight", "Great post", "Thanks for sharing", "Interesting", "Well said"

Role: {role}
Tone: {tone}
Extra: {custom_prompt or "None"}

Post by @{username}:
"{post_text[:450]}"
"""

        contents = [prompt]

        if image_url:
            try:
                contents.append(
                    types.Part.from_uri(
                        file_uri=image_url,
                        mime_type="image/jpeg"
                    )
                )
                print(f"[Gemini] Image added: {image_url}")
            except Exception as img_err:
                print(f"[Gemini] Image load failed: {img_err}")

        # ========== Retry for 503 & 429 ==========
        max_retries = 4
        response = None

        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                )
                break
            except Exception as e:
                error_str = str(e)

                if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                    print(f"[Gemini] Quota exceeded (429), waiting & retry {attempt + 1}/{max_retries}...")
                    if attempt < max_retries - 1:
                        # error মেসেজে যে সময় বলে সেটা অনুযায়ী অপেক্ষা
                        wait_time = 20 + (attempt * 5)
                        print(f"[Gemini] Waiting {wait_time} seconds...")
                        time.sleep(wait_time)
                    else:
                        raise e

                elif "503" in error_str or "UNAVAILABLE" in error_str or "high demand" in error_str.lower():
                    print(f"[Gemini] High demand (503), retry {attempt + 1}/{max_retries}...")
                    if attempt < max_retries - 1:
                        time.sleep(3 + attempt * 2)
                    else:
                        raise e
                else:
                    raise e

        text = response.text.strip().strip('"').strip("'").strip()

        words = text.split()
        if len(words) > 10:
            text = " ".join(words[:10])

        print(f"[gemini-3.6-flash] → {text}")
        return text

    except Exception as e:
        error_msg = str(e)
        print(f"[Gemini Error] {error_msg}")

        fallbacks = [
            "This perspective is quite useful.",
            "Appreciate the clear explanation.",
            "Solid reasoning behind this point.",
            "Helpful insight on the topic.",
            "Well thought out observation.",
            "Good breakdown of the issue.",
            "Valuable point raised here."
        ]
        return random.choice(fallbacks)