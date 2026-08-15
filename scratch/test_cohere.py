import os
from dotenv import load_dotenv
import cohere

load_dotenv()
api_key = os.getenv("COHERE_API_KEY")
print(f"COHERE_API_KEY length: {len(api_key) if api_key else 'None'}")

try:
    co = cohere.Client(api_key=api_key)
    res = co.embed(texts=["Hello"], model="embed-multilingual-v3.0", input_type="search_query")
    print("Success, dimensions:", len(res.embeddings[0]))
except Exception as e:
    print("Error:", repr(e))
