import re

with open("src/api/v1/editor.py", "r") as f:
    text = f.read()

# Move the two imports to the top
text = text.replace("from src.rag.config import get_rag_settings\nfrom src.services.etl_service import process_pdf_background\n", "")
text = "from src.rag.config import get_rag_settings\nfrom src.services.etl_service import process_pdf_background\n" + text

with open("src/api/v1/editor.py", "w") as f:
    f.write(text)

with open("scripts/benchmark_streaming_buffer.py", "r") as f:
    text = f.read()
text = text.replace("import json as _json", "")
text = "import json as _json\n" + text
with open("scripts/benchmark_streaming_buffer.py", "w") as f:
    f.write(text)

