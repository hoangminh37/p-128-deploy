"""Kiểm nhanh: key Groq và MODEL_NAME trong .env có gọi được không.

Đọc MODEL_NAME từ .env chứ KHÔNG hardcode. Bản trước ghi cứng
"llama-3.3-70b-versatile" — model đó đã bị Groq gỡ khỏi nền tảng, nên script
vốn để trả lời "key mình có chạy không" lại luôn báo lỗi kể cả khi key hoàn
toàn tốt.
"""

import os

from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("MODEL_NAME", "openai/gpt-oss-120b")

print(f"GROQ_API_KEY length: {len(api_key) if api_key else 'None'}")
print(f"MODEL_NAME: {model}")

try:
    llm = ChatGroq(model=model, api_key=api_key)
    res = llm.invoke("Xin chào")
    print("Success:", res.content)
except Exception as e:
    text = repr(e)
    print("Error:", text)

    # 401 và 404 dẫn tới hai việc phải làm hoàn toàn khác nhau, mà thông báo
    # thô của SDK không nói rõ điều đó — nên nói hộ ở đây.
    if "401" in text or "invalid_api_key" in text or "expired" in text:
        print("\n-> KEY hong hoac het han. Lay key moi tai console.groq.com")
    elif "404" in text or "model_not_found" in text:
        print(f"\n-> KEY VAN TOT. Model '{model}' khong ton tai voi key nay.")
        print("   Chay: python scripts/list_groq_models.py")
