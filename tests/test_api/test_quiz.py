"""Test cho luồng trắc nghiệm kiến thức.

Chia hai nhóm:

- Kiểm định bộ đề: thuần luật, không mock gì, chạy trong micro giây.
- Endpoint: chỉ kiểm tra cửa xác thực và ràng buộc request. Không gọi LLM thật.

Chấm điểm chưa test được ở tầng endpoint vì conftest chưa có fixture client đã
đăng nhập kèm DB tạm (xem ghi chú trong test_routes.py). Phần đó đang được phủ
gián tiếp qua test luật ở dưới.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.schemas.quiz import QuizRequest, QuizSubmitRequest
from src.services.quiz.validator import (
    QuizValidationError,
    validate_question,
    validate_quiz,
)


def make_question(**overrides) -> dict:
    """Một câu hợp lệ, ghi đè từng trường để dựng ca lỗi."""
    base = {
        "question": "Vì sao nên chia nhỏ bữa ăn trong ngày?",
        "options": [
            "Giúp đường huyết ổn định hơn",
            "Giúp ăn được nhiều hơn",
            "Giúp giảm tiền chợ",
            "Giúp ngủ ngon hơn",
        ],
        "correct_index": 0,
        "explanation": "Chia nhỏ bữa giúp tránh đường huyết tăng vọt sau ăn.",
        "difficulty": "easy",
    }
    base.update(overrides)
    return base


# ── Kiểm định từng câu ───────────────────────────────────────────────────────


def test_cau_hop_le_di_qua():
    result = validate_question(make_question(), position=1)
    assert result["correct_index"] == 0
    assert len(result["options"]) == 4
    assert result["difficulty"] == "easy"


def test_thieu_dap_an_bi_loai():
    with pytest.raises(QuizValidationError, match="cần đúng 4"):
        validate_question(make_question(options=["A", "B", "C"]), position=1)


def test_correct_index_ngoai_mang_bi_loai():
    with pytest.raises(QuizValidationError, match="correct_index"):
        validate_question(make_question(correct_index=7), position=1)


def test_correct_index_khong_phai_so_bi_loai():
    with pytest.raises(QuizValidationError, match="correct_index"):
        validate_question(make_question(correct_index="0"), position=1)


def test_dap_an_trung_nhau_bi_loai():
    """Trùng kể cả khi khác dấu và khác hoa thường — người học vẫn thấy là một."""
    trung = make_question(options=["Ăn nhạt", "ăn nhat", "Tập thể dục", "Ngủ đủ"])
    with pytest.raises(QuizValidationError, match="trùng nhau"):
        validate_question(trung, position=1)


@pytest.mark.parametrize(
    "dap_an_cam",
    ["Tất cả các đáp án trên", "Không đáp án nào đúng", "Cả A và B", "tat ca deu dung"],
)
def test_dap_an_an_gian_bi_loai(dap_an_cam):
    cau = make_question(options=["Ăn nhạt", "Tập thể dục", "Ngủ đủ", dap_an_cam])
    with pytest.raises(QuizValidationError, match="đáp án bị cấm"):
        validate_question(cau, position=1)


@pytest.mark.parametrize(
    "cau_hoi_cam",
    [
        "Khi đường huyết cao bạn nên uống thuốc gì?",
        "Bác nên tiêm bao nhiêu đơn vị insulin?",
        "Liều lượng bao nhiêu là đủ cho một ngày?",
        "Chẩn đoán là gì khi có các dấu hiệu này?",
    ],
)
def test_cau_hoi_ke_don_hoac_chan_doan_bi_loai(cau_hoi_cam):
    """Lằn ranh giáo dục/kê đơn phải giữ ở cả đề trắc nghiệm, không riêng luồng chat."""
    with pytest.raises(QuizValidationError, match="chẩn đoán hoặc kê đơn"):
        validate_question(make_question(question=cau_hoi_cam), position=1)


def test_thieu_giai_thich_duoc_va_chu_khong_bi_loai():
    """Giải thích trống làm đề kém đi chứ không làm nó sai — vá thay vì vứt."""
    result = validate_question(make_question(explanation=""), position=1)
    assert result["explanation"]
    assert "Giúp đường huyết ổn định hơn" in result["explanation"]


def test_do_kho_la_bi_ep_ve_medium():
    result = validate_question(make_question(difficulty="siêu khó"), position=1)
    assert result["difficulty"] == "medium"


# ── Kiểm định cả bộ ──────────────────────────────────────────────────────────


def test_bo_de_loai_cau_hong_giu_cau_tot():
    """Một câu hỏng không được kéo cả bộ đề xuống."""
    drafts = [make_question(), make_question(options=["A", "B"]), make_question(), make_question()]
    result = validate_quiz(drafts, min_questions=3)

    assert len(result) == 3
    assert [q["index"] for q in result] == [0, 1, 2]


def test_bo_de_qua_it_cau_hop_le_thi_truot():
    drafts = [make_question(), make_question(correct_index=9)]
    with pytest.raises(QuizValidationError, match="cần tối thiểu 3"):
        validate_quiz(drafts, min_questions=3)


def test_index_duoc_danh_lai_lien_mach():
    """Index phải liền mạch sau khi loại câu giữa, nếu không FE map sai đáp án."""
    drafts = [make_question(), make_question(question="Khi nào cần đi khám ngay?"), make_question()]
    result = validate_quiz(drafts, min_questions=3)
    assert [q["index"] for q in result] == [0, 1, 2]


# ── Ràng buộc request ────────────────────────────────────────────────────────


def test_source_article_thieu_article_id_bi_chan():
    with pytest.raises(ValidationError, match="article_id"):
        QuizRequest(source="article")


def test_source_conversation_thieu_conversation_id_bi_chan():
    with pytest.raises(ValidationError, match="conversation_id"):
        QuizRequest(source="conversation")


def test_source_profile_khong_can_ref():
    request = QuizRequest(source="profile")
    assert request.source_ref is None
    assert request.num_questions == 5


def test_source_ref_tra_dung_khoa_theo_source():
    assert QuizRequest(source="article", article_id="a_X").source_ref == "a_X"
    assert QuizRequest(source="conversation", conversation_id="c_X").source_ref == "c_X"


@pytest.mark.parametrize("so_cau", [1, 11])
def test_so_cau_ngoai_khoang_bi_chan(so_cau):
    with pytest.raises(ValidationError):
        QuizRequest(source="profile", num_questions=so_cau)


def test_de_hai_cau_duoc_chap_nhan():
    """Khối "Ôn tập nhanh" cuối mỗi bài học xin đúng 2 câu."""
    assert QuizRequest(source="article", article_id="a_X", num_questions=2).num_questions == 2


def test_submit_rong_bi_chan():
    with pytest.raises(ValidationError):
        QuizSubmitRequest(answers=[])


# ── Cửa xác thực ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tao_quiz_can_dang_nhap(client):
    response = await client.post("/api/v1/quiz", json={"source": "profile"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_nop_bai_can_dang_nhap(client):
    response = await client.post("/api/v1/quiz/q_ABC123/submit", json={"answers": [0, 1, 2]})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_lich_su_can_dang_nhap(client):
    response = await client.get("/api/v1/quiz/history")
    assert response.status_code == 401


# ── Ngữ cảnh ôn tập tổng hợp ─────────────────────────────────────────────────
#
# Ghép hai nguồn dấu vết (bài đã học + câu đã hỏi) là logic thuần, tách riêng
# khỏi phần truy vấn DB nên test được mà không cần database.


class FakeArticle:
    """Đủ trường mà _cumulative_context đụng tới."""

    def __init__(self, id_: str, title: str, full_content: str = "", content: str = ""):
        self.id = id_
        self.title = title
        self.full_content = full_content
        self.content = content


class FakePatient:
    def __init__(self, age: int = 60, asking_as: str = "self"):
        self.age = age
        self.primary_condition = "type2_diabetes"
        self.comorbidities = []
        self.diagnosed_at = None
        self.asking_as = asking_as


def test_ngu_canh_gom_ca_bai_da_hoc_va_cap_hoi_dap():
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_1", "Chế độ ăn", full_content="Chia nhỏ bữa ăn giúp đường huyết ổn định.")],
        [("Tôi ăn cơm được không?", "Cơm trắng làm đường huyết tăng nhanh, nên ăn ít lại.")],
    )

    assert "ĐÃ HỌC 1 — Chế độ ăn" in ctx.context
    assert "Chia nhỏ bữa ăn" in ctx.context
    assert "ĐÃ TRAO ĐỔI" in ctx.context
    assert "Tôi ăn cơm được không?" in ctx.context
    # Câu TRẢ LỜI phải có mặt — nó là nguồn kiến thức, không chỉ câu hỏi.
    assert "Cơm trắng làm đường huyết tăng nhanh" in ctx.context


def test_cau_nguoi_hoc_hoi_khong_duoc_dung_lam_nguon_kien_thuc():
    """Ranh giới tinh tế trong khối ĐÃ TRAO ĐỔI: lấy phần ĐÁP, cấm phần HỎI.

    Câu trả lời của trợ lý đã qua selfrag_verifier nên dùng làm nguồn được. Còn
    câu hỏi của người bệnh có thể chứa chính hiểu lầm họ đang mắc — "uống nước
    dừa chữa được tiểu đường phải không?". Ra đề từ đó là dạy lại cái sai.

    Nên prompt phải nói rõ CẢ HAI vế, không chỉ vế cho phép.
    """
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [],
        [("Uống nước dừa chữa được tiểu đường phải không?", "Không có bằng chứng nào cho điều đó.")],
    )
    assert "CHƯA CHẮC" in ctx.context
    assert "TRỢ LÝ ĐÃ TRẢ LỜI" in ctx.context
    assert "không lấy từ phần người học hỏi" in ctx.context


def test_cap_hoi_dap_duoc_tinh_la_grounded():
    """ĐỔI Ý NGHĨA so với bản trước — có lý do.

    Bản trước coi "chỉ hỏi mà chưa học bài nào" là KHÔNG grounded, vì lúc đó ngữ
    cảnh chỉ có danh sách câu hỏi trần trụi, không kèm kiến thức nào.

    Nay ngữ cảnh mang theo cả câu TRẢ LỜI của trợ lý. Câu đó chỉ được gửi tới
    người bệnh sau khi `selfrag_verifier` xác nhận nó bám được vào tài liệu đã
    duyệt — nghĩa là nó ĐÃ có nguồn. Coi nó là không grounded thì FE sẽ hiện
    cảnh báo "chưa đối chiếu được với tài liệu gốc" một cách sai sự thật.

    Không còn nguồn nào thì mới là không grounded.
    """
    from src.services.quiz.context import _cumulative_context

    co_hoi_dap = _cumulative_context(
        FakePatient(), [], [("Tôi nên tập thể dục thế nào?", "Đi bộ 30 phút mỗi ngày là đủ.")]
    )
    assert co_hoi_dap.grounded is True

    co_hoc = _cumulative_context(FakePatient(), [FakeArticle("a_1", "Vận động", content="Đi bộ 30 phút.")], [])
    assert co_hoc.grounded is True

    # Chỉ có chỗ đã sai, không bài học, không hỏi đáp, không tài liệu truy xuất.
    from src.services.quiz.mistakes import Mistake

    khong_nguon = _cumulative_context(
        FakePatient(),
        [],
        [],
        [Mistake(question="X", options=["A", "B", "C", "D"], correct_index=0, explanation="", times_wrong=1)],
    )
    assert khong_nguon.grounded is False


def test_bai_moi_hoc_duoc_uu_tien_va_dung_thu_tu():
    """Bài hoàn thành gần nhất phải đứng đầu ngữ cảnh."""
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_2", "Bài mới nhất", content="X"), FakeArticle("a_1", "Bài cũ hơn", content="Y")],
        [],
    )
    assert ctx.context.index("Bài mới nhất") < ctx.context.index("Bài cũ hơn")


def test_full_content_duoc_uu_tien_hon_tom_tat():
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_1", "T", full_content="NOI DUNG DAY DU", content="tom tat ngan")],
        [],
    )
    assert "NOI DUNG DAY DU" in ctx.context
    assert "tom tat ngan" not in ctx.context


def test_topic_noi_ro_da_hoc_va_da_trao_doi_bao_nhieu():
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_1", "A", content="x"), FakeArticle("a_2", "B", content="y")],
        [("q1", "a1"), ("q2", "a2"), ("q3", "a3")],
    )
    assert "2 bài đã học" in ctx.topic
    assert "3 lượt đã trao đổi" in ctx.topic


def test_moi_bai_da_hoc_sinh_ra_mot_citation():
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_1", "A", content="x"), FakeArticle("a_2", "B", content="y")],
        [],
    )
    assert [c["id"] for c in ctx.citations] == [1, 2]
    assert [c["title"] for c in ctx.citations] == ["A", "B"]


def test_ho_so_cao_tuoi_van_di_vao_ngu_canh_tong_hop():
    from src.services.quiz.context import _cumulative_context

    ctx = _cumulative_context(FakePatient(age=78), [FakeArticle("a_1", "A", content="x")], [])
    assert "bác" in ctx.profile


# ── Thu thập câu sai ─────────────────────────────────────────────────────────
#
# extract_mistakes nhận thẳng danh sách session nên test được không cần DB.


class FakeSession:
    def __init__(self, id_, questions, answers, submitted=True, topic="T", source_ref=None):
        self.id = id_
        self.questions = questions
        self.answers = answers
        self.submitted_at = "2026-08-24" if submitted else None
        self.topic = topic
        self.source_ref = source_ref


def q(text, correct=0):
    return {
        "question": text,
        "options": ["A", "B", "C", "D"],
        "correct_index": correct,
        "explanation": f"Vì {text}",
        "difficulty": "easy",
    }


def test_chi_lay_cau_tra_loi_sai():
    from src.services.quiz.mistakes import extract_mistakes

    s = FakeSession("q_1", [q("Câu đúng", 0), q("Câu sai", 1)], answers=[0, 3])
    result = extract_mistakes([s])

    assert len(result) == 1
    assert result[0].question == "Câu sai"
    assert result[0].correct_index == 1
    assert result[0].chosen == [3]


def test_luot_chua_nop_bi_bo_qua():
    """Chưa nộp thì chưa có gì để gọi là sai."""
    from src.services.quiz.mistakes import extract_mistakes

    s = FakeSession("q_1", [q("X", 0)], answers=[2], submitted=False)
    assert extract_mistakes([s]) == []


def test_cung_mot_cau_sai_nhieu_lan_duoc_gom_va_dem():
    from src.services.quiz.mistakes import extract_mistakes

    result = extract_mistakes(
        [
            FakeSession("q_2", [q("Đo đường huyết khi nào?", 0)], answers=[1]),
            FakeSession("q_1", [q("Đo đường huyết khi nào?", 0)], answers=[2]),
        ]
    )

    assert len(result) == 1
    assert result[0].times_wrong == 2
    # Giữ cả hai lựa chọn: sai theo hai kiểu khác nhau nói lên nhiều hơn.
    assert result[0].chosen == [1, 2]


def test_gom_nhom_khong_le_thuoc_dau_va_hoa_thuong():
    from src.services.quiz.mistakes import extract_mistakes

    result = extract_mistakes(
        [
            FakeSession("q_2", [q("Ăn nhạt là gì?", 0)], answers=[1]),
            FakeSession("q_1", [q("ăn nhat  LA GI?", 0)], answers=[1]),
        ]
    )
    assert len(result) == 1
    assert result[0].times_wrong == 2


def test_cau_sai_nhieu_lan_dung_truoc():
    from src.services.quiz.mistakes import extract_mistakes

    result = extract_mistakes(
        [
            FakeSession("q_2", [q("Sai một lần", 0), q("Sai hai lần", 0)], answers=[1, 1]),
            FakeSession("q_1", [q("Sai hai lần", 0)], answers=[2]),
        ]
    )
    assert result[0].question == "Sai hai lần"
    assert result[0].times_wrong == 2


def test_mang_answers_ngan_hon_questions_khong_lam_no():
    """Dữ liệu lệch thì bỏ qua phần thiếu, không được ném lỗi."""
    from src.services.quiz.mistakes import extract_mistakes

    s = FakeSession("q_1", [q("A", 0), q("B", 0), q("C", 0)], answers=[1])
    result = extract_mistakes([s])
    assert len(result) == 1
    assert result[0].question == "A"


def test_source_ref_duoc_giu_de_tim_lai_tai_lieu_goc():
    from src.services.quiz.mistakes import extract_mistakes

    s = FakeSession("q_1", [q("X", 0)], answers=[1], source_ref="a_ABC123")
    assert extract_mistakes([s])[0].source_ref == "a_ABC123"


def test_gioi_han_so_nhom_tra_ve():
    from src.services.quiz.mistakes import MAX_MISTAKE_GROUPS, extract_mistakes

    nhieu = [q(f"Câu số {i}", 0) for i in range(40)]
    s = FakeSession("q_1", nhieu, answers=[1] * 40)
    assert len(extract_mistakes([s])) == MAX_MISTAKE_GROUPS


def test_source_mistakes_khong_can_ref():
    from src.schemas.quiz import QuizRequest

    r = QuizRequest(source="mistakes")
    assert r.source_ref is None


def test_cau_sai_di_vao_ngu_canh_on_tap_tong_hop():
    from src.services.quiz.context import _cumulative_context
    from src.services.quiz.mistakes import Mistake

    ctx = _cumulative_context(
        FakePatient(),
        [FakeArticle("a_1", "Bài", content="Nội dung")],
        [("Câu đã hỏi", "Trợ lý đáp")],
        [Mistake(question="Chỗ đã sai", options=["A", "B", "C", "D"], correct_index=0, explanation="x", times_wrong=3)],
    )
    assert "ĐÃ TRẢ LỜI SAI" in ctx.context
    assert "Chỗ đã sai" in ctx.context
    assert "sai 3 lần" in ctx.context
    assert "1 chỗ đã sai" in ctx.topic


@pytest.mark.asyncio
async def test_xem_cau_sai_can_dang_nhap(client):
    response = await client.get("/api/v1/quiz/mistakes")
    assert response.status_code == 401
