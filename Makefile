.PHONY: run test lint format typecheck check clean eval \
        rag-parse rag-build rag-index rag-all rag-stats rag-test

run:
	.venv/bin/uvicorn src.main:app --reload --reload-dir src --host 0.0.0.0 --port 8000

test:
	.venv/bin/pytest tests/ -v

lint:
	.venv/bin/ruff check src/ tests/

format:
	.venv/bin/ruff format src/ tests/

typecheck:
	.venv/bin/mypy src/

check: lint format test

eval:
	.venv/bin/python eval/run_ragas_eval.py
	.venv/bin/python eval/run_custom_eval.py

# ---- Tầng dữ liệu (src/rag) — chủ sở hữu: Khanh ---------------------------
# Thứ tự thông thường: rag-parse (chậm, chạy 1 lần) -> rag-build -> rag-index.
# `make rag-all` chạy build + index, dùng lại cache parse đã có.

rag-parse:            ## Parse PDF/PPTX bằng Docling, cache ra data/interim (~10-15 phút)
	.venv/bin/python -m src.rag.pipeline parse

rag-build:            ## Sửa cấu trúc + cắt chunk -> data/processed/chunks.jsonl + manifest.json
	.venv/bin/python -m src.rag.pipeline build

rag-index:            ## Embed và nạp vào Chroma (cần OPENAI_API_KEY)
	.venv/bin/python -m src.rag.pipeline index --reset

rag-all:              ## build rồi index
	.venv/bin/python -m src.rag.pipeline all --reset

rag-stats:            ## Xem manifest và trạng thái vector store
	.venv/bin/python -m src.rag.pipeline stats

rag-test:             ## Chỉ chạy test của tầng dữ liệu (không cần Docling)
	.venv/bin/pytest tests/test_rag/ -q

rag-pending:          ## [biên tập viên] xem tài liệu đang chờ duyệt
	.venv/bin/python -m src.rag.pipeline pending

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +

docker-up:	## Khởi động toàn bộ stack (backend)
	docker compose up -d

docker-down:	## Dừng toàn bộ stack
	docker compose down
