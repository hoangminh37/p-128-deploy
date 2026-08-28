# 🏆 Báo cáo Benchmark Hệ Thống Medical AI

Báo cáo so sánh chất lượng giữa các hệ thống (Baseline vs Proposed Agent).

## 1. Hệ thống thử nghiệm
- **Baseline 1 (Direct LLM)**: LLM thuần, không dùng tài liệu y tế.
- **Baseline 2 (Naive RAG)**: Trích xuất vector cơ bản, đưa vào LLM, không kiểm duyệt.
- **Proposed Agent (LangGraph)**: Hệ thống RAG cá nhân hoá + Intent Router + Self-RAG Verifier.

## 2. Kết quả đánh giá RAGAS (Chỉ áp dụng cho câu hỏi Kiến thức)
# Evaluation Evidence — Team XXX

## 1. RAG Quality Metrics (RAGAS)

| Metric | Score | Benchmark |
|--------|-------|-----------|
| faithfulness | 0.76 | > 0.7 (✅ PASS) |
| answer_relevancy | 0.25 | > 0.7 (❌ FAIL) |
| context_precision | 0.73 | > 0.7 (✅ PASS) |
| context_recall | 0.81 | > 0.7 (✅ PASS) |

*(Báo cáo được tạo tự động bởi eval/run_ragas_eval.py)*


## 3. Kết quả đánh giá Custom Judge (Đánh giá Guardrails toàn bộ Dataset)
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


## 4. So sánh trực quan

### Mẫu so sánh (Câu hỏi 1)
**Câu hỏi:** Đái tháo đường type 2 là bệnh gì?
**Ground Truth:** Đái tháo đường type 2 là bệnh lý do cơ thể kháng insulin, làm tăng đường huyết.

**Baseline 1 (Direct LLM):**
> Đái tháo đường type 2, hay còn gọi là tiểu đường type 2, là một bệnh lý mãn tính liên quan đến sự rối loạn chuyển hóa glucose trong cơ thể. Trong bệnh này, cơ thể không sử dụng insulin một cách hiệu quả (kháng insulin) hoặc không sản xuất đủ insulin để duy trì mức đường huyết bình thường. 

Insulin là hormone do tuyến tụy sản xuất, có vai trò quan trọng trong việc điều chỉnh lượng glucose trong máu. Khi cơ thể không thể sử dụng insulin hiệu quả, lượng glucose trong máu sẽ tăng cao, dẫn đến nhiều biến chứng nghiêm trọng nếu không được kiểm soát.

Các triệu chứng phổ biến của đái tháo đường type 2 bao gồm:

- Khát nước nhiều
- Đi tiểu thường xuyên
- Mệt mỏi
- Mờ mắt
- Vết thương lâu lành

Nguyên nhân chính của bệnh thường liên quan đến yếu tố di truyền, lối sống không lành mạnh (chế độ ăn uống không cân bằng, thiếu vận động), và thừa cân béo phì. 

Việc quản lý bệnh đái tháo đường type 2 thường bao gồm thay đổi lối sống, chế độ ăn uống hợp lý, tập thể dục thường xuyên, và trong một số trường hợp, cần dùng thuốc hoặc insulin để kiểm soát lượng đường trong máu.

**Baseline 2 (Naive RAG):**
> Đái tháo đường típ 2 là một bệnh rối loạn chuyển hóa, đặc trưng bởi tình trạng tăng glucose huyết mạn tính do giảm chức năng của tế bào beta tụy tiến triển trên nền tảng đề kháng insulin. Bệnh này chiếm 90-95% các trường hợp đái tháo đường và thường xảy ra ở người trưởng thành. Đái tháo đường típ 2 có thể liên quan đến béo phì, đặc biệt là béo phì vùng bụng, và có thể được dự phòng hoặc làm chậm xuất hiện thông qua lối sống lành mạnh.

**Proposed Agent (LangGraph):**
> Bệnh đái tháo đường típ 2 là một rối loạn chuyển hóa, đặc trưng bởi tăng glucose huyết mạn tính do khiếm khuyết về tiết insulin hoặc tác động của insulin, hoặc cả hai. Tăng glucose huyết kéo dài có thể gây ra nhiều biến chứng nghiêm trọng như bệnh tim mạch, mù lòa, suy thận và cắt cụt chi. Theo Liên đoàn Đái tháo đường Quốc tế, năm 2019 có khoảng 463 triệu người trên toàn thế giới mắc bệnh này, và con số dự kiến sẽ tăng lên 700 triệu vào năm 2045. Đáng chú ý, khoảng 70% trường hợp đái tháo đường típ 2 có thể được dự phòng hoặc làm chậm lại thông qua lối sống lành mạnh, bao gồm chế độ dinh dưỡng hợp lý và luyện tập thể dục thường xuyên [doc_1], [doc_2]. 

- Bạn có biết về các triệu chứng của bệnh đái tháo đường típ 2 không?
- Bạn có thói quen ăn uống hoặc luyện tập nào mà bạn muốn thay đổi không?
- Bạn có muốn tìm hiểu thêm về cách phòng ngừa bệnh đái tháo đường típ 2 không?

Lưu ý: Thông tin trên chỉ mang tính chất giáo dục và tham khảo, không thay thế cho việc tư vấn, chẩn đoán hay điều trị y khoa. Hãy tham khảo ý kiến bác sĩ chuyên khoa.


*(Vui lòng xem file `eval/results/eval_dataset.json` và `eval/results/eval_dataset_baselines.json` để xem toàn bộ 50 câu trả lời của 3 hệ thống)*
