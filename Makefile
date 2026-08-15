.PHONY: run dev test lint format typecheck check clean eval seed check-qdrant docker-up docker-down

run:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests/ -v

lint:
	ruff check src/ tests/

format:
	ruff format src/ tests/

typecheck:
	mypy src/

check: lint format test

eval:
	python eval/run_ragas_eval.py
	python eval/run_custom_eval.py

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +

seed:		## Seed medical docs vào Qdrant
	python scripts/seed_medical_docs.py

check-qdrant:	## Kiểm tra Qdrant collection
	python scripts/check_qdrant.py

docker-up:	## Khởi động toàn bộ stack (backend + qdrant)
	docker compose up -d

docker-down:	## Dừng toàn bộ stack
	docker compose down

