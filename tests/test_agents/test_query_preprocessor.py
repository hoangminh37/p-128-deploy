"""Tests helper input của preprocessing gộp v2."""

from src.agent.nodes.preprocessing.query_preprocessor import _format_history, _format_profile, _parse_response


def test_preprocessor_giu_sau_luot_hoi_thoai_gan_nhat():
    messages = [{"role": "user", "content": str(index)} for index in range(8)]

    history = _format_history(messages)

    assert "User: 1" not in history
    assert "User: 2" in history
    assert "User: 7" in history


def test_preprocessor_chi_gui_profile_can_thiet():
    profile = {
        "age": 58,
        "primary_condition": "hypertension",
        "comorbidities": ["type2_diabetes"],
    }

    formatted = _format_profile(profile)

    assert "Tuổi: 58" in formatted
    assert "Bệnh chính: hypertension" in formatted
    assert "Thời điểm chẩn đoán" not in formatted


def test_preprocessor_gui_thoi_diem_chan_doan_vao_ngu_canh_ho_so():
    formatted = _format_profile(
        {
            "primary_condition": "hypertension",
            "diagnosed_at": "2024-05",
            "height_cm": 165,
            "weight_kg": 68.5,
        }
    )

    assert "Thời điểm chẩn đoán: 2024-05" in formatted
    assert "Chiều cao: 165 cm" in formatted
    assert "Cân nặng: 68.5 kg" in formatted


def test_preprocessor_tra_query_va_routine_co_cau_truc():
    raw = """<query>Tôi đi bộ 30 phút mỗi sáng, nên theo dõi huyết áp thế nào?</query>
<routine_updates>[{"category":"activity", "evidence":"Tôi đi bộ 30 phút mỗi sáng"}]</routine_updates>"""

    query, updates = _parse_response(raw, "fallback")

    assert query.startswith("Tôi đi bộ")
    assert updates == [{"category": "activity", "evidence": "Tôi đi bộ 30 phút mỗi sáng"}]


def test_preprocessor_khong_luu_routine_khi_output_loi_format():
    query, updates = _parse_response("Một câu trả lời lệch format", "Câu hỏi gốc")

    assert query == "Câu hỏi gốc"
    assert updates == []
