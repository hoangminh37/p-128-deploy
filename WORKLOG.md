# Worklog — Team P-128

> Ghi lại tất cả công việc đã làm theo ngày. Ai làm gì, kết quả gì.
>
> **Dự án:** Agent Giáo dục Sức khỏe Cá nhân hóa cho Bệnh nhân Mãn tính
> **Thành viên:** Khanh Nguyen · Anh Đức · Hoàng Minh
> **Quy ước Status:** ✅ Done · 🔄 WIP · ❌ Blocked

---

## 2026-07-24

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Cả team | Khởi tạo repo từ starter template (`src/`, `tests/`, `eval/`, Docker, Makefile, CI) | ✅ Done | Commit `63d145a` — initial commit | 1h |
| Cả team | Thống nhất chủ đề dự án: agent giáo dục sức khỏe cho bệnh nhân mãn tính | ✅ Done | Chốt hướng đi cho Gate 1 | 1h |

**Tổng kết ngày:** Repo được khởi tạo từ template của chương trình, team chốt được chủ đề dự án để bắt đầu chuẩn bị hồ sơ Gate 1.

---

## 2026-07-29

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Hoàng Minh | Cấu hình và kiểm thử AI log hook (`.ai-log/`) | ✅ Done | Commit `7ab81c6` — hook ghi log hoạt động đúng | 1h |

**Tổng kết ngày:** Hạ tầng ghi AI log (deliverable #4) đã hoạt động, mọi phiên làm việc với AI từ nay được ghi nhận tự động.

---

## 2026-08-02

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Anh Đức | Thiết kế UI flow và wireframe cho 2 vai trò (bệnh nhân + biên tập viên y khoa) | ✅ Done | `docs/gate1/wireframes/` — `ui_flow.pdf`, `wireframe_benhnhan.pdf`, `wireframe_bientapvien.pdf` (PR #1) | 4h |
| Khanh Nguyen | Viết Project Brief Gate 1: vấn đề, đối tượng, phạm vi, tiêu chí thành công, ràng buộc an toàn, rủi ro | ✅ Done | `docs/gate1/brief.md` (PR #2) | 4h |
| Cả team | Review và merge PR #1, PR #2 vào `main` | ✅ Done | Merge `495ec74`, `8a468e4` | 0.5h |

**Tổng kết ngày:** Hoàn thành hai hạng mục chính của Gate 1 — brief và wireframe/UI flow — theo quy trình branch + PR review. Đã xác định rõ 7 pain point, 3 cam kết bất biến (có nguồn / cá nhân hóa / không chẩn đoán) và 7 rủi ro kèm biện pháp giảm thiểu.

---

## 2026-08-09

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Khanh Nguyen | Hoàn tất setup môi trường làm việc trên repo | ✅ Done | Môi trường chạy được ở local | 1h |
| Khanh Nguyen | Tạo branch `docs` và cập nhật Worklog theo tiến độ thực tế | 🔄 WIP | `WORKLOG.md` | 0.5h |
| Cả team | Thu thập tài liệu y khoa đã kiểm duyệt cho bệnh đầu tiên (đái tháo đường type 2) | 🔄 WIP | Thư viện v1 (đang thu thập) | - |

**Tổng kết ngày:** Chuyển từ giai đoạn tài liệu Gate 1 sang chuẩn bị Giai đoạn 1 — dựng thư viện tài liệu đã duyệt và pipeline RAG cơ bản.

---

## 2026-08-13

| Member | Task | Status | Output | Time |
|--------|------|--------|--------|------|
| Hoàng Minh | Bổ sung test cases cá nhân hóa (người cao tuổi, caregiver) vào `raw_test_cases.json` | ✅ Done | `eval/data/raw_test_cases.json` | 1h |
| Hoàng Minh | Viết kịch bản Custom LLM-as-a-Judge bằng `gpt-4o-mini` để đánh giá nghiệp vụ PRD (Citations, Tone, Next-best questions) | ✅ Done | `eval/run_custom_eval.py`, báo cáo `custom_report.md` | 2h |
| Hoàng Minh | Tái cấu trúc CI Pipeline, tách Backend/Frontend, thiết lập branch protection, và sửa toàn bộ lỗi Mypy typing | ✅ Done | `.github/workflows/ci.yml`, `src/services/llm.py`, `src/agents/graph.py` | 2h |

**Tổng kết ngày:** Hoàn thiện 100% cơ sở hạ tầng Evaluation (kết hợp RAGAS và Custom Judge). Xử lý dứt điểm nợ kỹ thuật (typing errors) và thiết lập vòng lặp CI/CD an toàn thông qua Pull Request Workflow.

---

## Trạng thái deliverables (Cập nhật 13/08/2026)

| # | Deliverable | Vị trí | Trạng thái |
|---|---|---|---|
| 1 | Source Code | `src/` | 🔄 Đang cập nhật |
| 2 | README.md | `README.md` | Chưa bắt đầu |
| 3 | Architecture Diagram | `ARCHITECTURE.md` | 🔄 Đang cập nhật |
| 4 | AI Logs | `.ai-log/` + LangSmith | ✅ Đã cấu hình |
| 5 | Live URL | Render / Vercel | Chưa bắt đầu |
| 6 | Video Demo | `presentation/` | Chưa bắt đầu |
| 7 | Pitch Deck | `presentation/` | Chưa bắt đầu |
| 8 | Development Journal | `JOURNAL.md` | ✅ Đã cập nhật |
| 9 | Worklog | `WORKLOG.md` | ✅ Đã cập nhật |
| 10 | Evaluation Evidence | `eval/results/` | ✅ Đã hoàn thành |
