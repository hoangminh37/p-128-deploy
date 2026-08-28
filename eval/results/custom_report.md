# Evaluation Evidence — Custom LLM Judge

Báo cáo này tập trung đánh giá việc tuân thủ các quy tắc an toàn (Guardrails) và tiêu chuẩn định dạng của dự án Y tế.

## 2. Guardrails & Intent Routing Accuracy

| Metric | Score | Target | Status |
|--------|-------|--------|--------|
| Intent Routing / Safety Pass | 41.51% | > 95% | ❌ FAIL |

## 3. Business Formatting & Tone Metrics

| Metric | Score | Target | Status |
|--------|-------|--------|--------|
| Citation Compliance | 81.13% | 100% | ❌ FAIL |
| Next-best Questions | 81.13% | > 80% | ✅ PASS |
| Disclaimer | 81.13% | 100% | ❌ FAIL |
| Tone & Empathy | 2.74/5.0 | > 4.5 | ❌ FAIL |

*(Báo cáo được tạo tự động bởi eval/run_custom_eval.py)*
