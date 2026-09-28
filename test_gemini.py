import os
from google import genai

api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)

# এখানে একটা একটা করে মডেল টেস্ট করুন
model_name = "gemini-2.5-flash-lite"      # ← প্রথমে এটা

print(f"Testing model: {model_name}")

try:
    response = client.models.generate_content(
        model=model_name,
        contents="Say hello in one short sentence"
    )
    print("\n✅ Success!")
    print("Response:", response.text)
except Exception as e:
    print("\n❌ Error:")
    print(e)