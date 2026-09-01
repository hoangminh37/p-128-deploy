---
title: "Testing Guide"
description: "Kiểm thử toàn diện và đánh giá AI Agent y tế"
weight: 5
---

Hệ thống Medical AI Agent (P-128) được xây dựng với chiến lược kiểm thử nghiêm ngặt gồm **320 unit/integration tests** tự động, kết hợp cùng khung đánh giá chất lượng **RAGAS Benchmark** và **Custom LLM-as-a-Judge** nhằm đảm bảo an toàn tuyệt đối cho người bệnh.

## Nội dung chi tiết

- [Writing Tests](writing-tests.md) — Cấu trúc 29 test suites, mẫu viết test cho Agent/RAG/API và quy trình chạy CI/CD.
- [Master Testing Specification & Evidence](../../03_testing/TESTING.md) — Đặc tả toàn bộ 320 tests, AI Benchmark Metrics, kịch bản Manual Test thẩm định và phân tích độ tương đồng.
- [Benchmark & Baseline Report](../../../eval/results/benchmark_report.md) — Báo cáo thực nghiệm so sánh với Baseline 1 (Direct LLM) và Baseline 2 (Naive RAG).


