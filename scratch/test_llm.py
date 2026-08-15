import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
print(f"GROQ_API_KEY length: {len(api_key) if api_key else 'None'}")

try:
    llm = ChatGroq(model_name="llama-3.3-70b-versatile", api_key=api_key)
    res = llm.invoke("Hello")
    print("Success:", res.content)
except Exception as e:
    print("Error:", repr(e))
