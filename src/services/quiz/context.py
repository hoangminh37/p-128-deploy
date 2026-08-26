"""Dựng ngữ cảnh cho ba nguồn sinh đề: article, conversation, profile.

Ba nguồn khác nhau ở MỨC ĐỘ TIN CẬY của nội dung, và cách xử lý phải khác theo:

- ``article``      — nội dung đã qua ETL và HITL duyệt, nằm sẵn trong bảng
                     Article. Dùng thẳng, không cần truy xuất lại.
- ``conversation`` — CẶP HỎI-ĐÁP của chính phiên chat đó. Không truy xuất lại
                     ChromaDB: câu trả lời đã qua ``generate_and_verify`` nên đã là
                     nội dung có nguồn, và nó đúng là thứ người bệnh vừa đọc.
- ``profile``      — ÔN TẬP TỔNG HỢP. Dựng từ dấu vết học tập của chính người
                     này: bài đã hoàn thành, CẶP HỎI-ĐÁP đã trao đổi, và những
                     chỗ đã trả lời sai. Chưa có gì thì mới lùi về lộ trình
                     theo bệnh.

                     Câu TRẢ LỜI của trợ lý được dùng làm nguồn kiến thức, không
                     chỉ câu hỏi. Nó đã qua ``generate_and_verify`` nên chỉ được gửi
                     đi khi bám được tài liệu đã duyệt — và nó đúng là thứ người
                     bệnh đã đọc. Nhờ vậy khỏi phải truy xuất lại ChromaDB, bớt
                     được một lượt embedding cộng một lần tìm kiếm khỏi độ trễ.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from src.core.logging import get_logger
from src.models.domain import (
    Article,
    Conversation,
    LearningPath,
    Message,
    Patient,
    PatientProgress,
)
from src.rag.store import VectorStore
from src.services.quiz.mistakes import collect_mistakes

logger = get_logger(__name__)

#: Số trích đoạn lấy từ ChromaDB cho một đề. Ít hơn top_k=8 của luồng chat: đề
#: trắc nghiệm cần chiều sâu trên một chủ đề hẹp hơn là quét rộng nhiều nguồn.
RETRIEVAL_TOP_K = 6

#: Trần ký tự đưa vào prompt.
#:
#: Không phải để vừa context window — 131k token thì thoải mái. Nó để vừa HẠN
#: MỨC TOKEN/PHÚT: tiếng Việt cỡ 1,64 ký tự một token, nên 5000 ký tự ~3050
#: token. Cộng system prompt (~1500) và max_tokens (3200) là ~7750, vừa dưới
#: hạn mức 8000/phút của Groq gói miễn phí.
#:
#: Bản trước để 8000 ký tự và request bị trả 413 ngay khi ngữ cảnh đầy.
MAX_CONTEXT_CHARS = 5000

#: Số lượt hội thoại gần nhất lấy ra làm chủ đề. Người bệnh thường đổi chủ đề
#: giữa phiên, nên lấy phần cuối sát với thứ họ vừa hỏi hơn là lấy từ đầu.
MAX_TRANSCRIPT_MESSAGES = 8

#: Số nhóm câu sai đưa vào prompt. Nhiều hơn thì đề loãng, mỗi khái niệm chỉ được
#: một câu và không đủ sức kiểm tra lại chỗ nào cho ra hồn.
MAX_MISTAKES_IN_PROMPT = 6

#: Số ký tự tối đa lấy từ mỗi câu trả lời của trợ lý. Câu trả lời đầy đủ dài
#: 1000-2000 ký tự; giữ nguyên vài cặp là hết sạch trần ngữ cảnh.
MAX_ANSWER_CHARS = 900

#: Chỉ những lượt trả lời THẬT SỰ CÓ NỘI DUNG GIÁO DỤC mới dùng làm nguồn.
#: Lời từ chối, cảnh báo cấp cứu hay câu chuyển bác sĩ không dạy được gì.
USABLE_ANSWER_STATUS = ("answered", "partial")

CONDITION_LABELS: dict[str, str] = {
    "type2_diabetes": "tiểu đường típ 2",
    "hypertension": "cao huyết áp",
}


class QuizContextError(RuntimeError):
    """Không dựng được ngữ cảnh — thiếu bài, thiếu phiên chat, hoặc kho rỗng."""


@dataclass
class QuizContext:
    """Nguyên liệu đưa vào prompt sinh đề."""

    topic: str
    context: str
    profile: str
    citations: list[dict] = field(default_factory=list)
    #: False khi đề chỉ dựa vào hồ sơ vì kho tài liệu không trả về gì.
    grounded: bool = True


# ── Hồ sơ bệnh nhân → câu mô tả cho prompt ───────────────────────────────────


def describe_profile(patient: Patient | None) -> str:
    """Diễn giải hồ sơ thành tiếng Việt để nhét vào prompt.

    Trả về câu văn chứ không phải JSON: prompt phía trên ra luật theo tuổi và
    bệnh đồng mắc, mà LLM bám luật theo văn xuôi ổn định hơn theo dict thô.
    """
    if patient is None:
        return "Chưa có hồ sơ. Hãy dùng ngôn ngữ phổ thông, phù hợp với mọi lứa tuổi."

    primary = CONDITION_LABELS.get(patient.primary_condition, patient.primary_condition)
    parts = [f"- Tuổi: {patient.age}", f"- Bệnh chính: {primary}"]

    comorbidities = [CONDITION_LABELS.get(c, c) for c in (patient.comorbidities or [])]
    parts.append(f"- Bệnh đồng mắc: {', '.join(comorbidities)}" if comorbidities else "- Bệnh đồng mắc: không có")

    if patient.diagnosed_at:
        parts.append(f"- Chẩn đoán từ: {patient.diagnosed_at}")

    if patient.asking_as == "caregiver":
        parts.append("- Người học là NGƯỜI CHĂM SÓC, không phải bệnh nhân. Đặt câu hỏi ở góc nhìn chăm sóc.")
    else:
        parts.append("- Người học chính là bệnh nhân.")

    if patient.age >= 65:
        parts.append("- Lưu ý: người cao tuổi. Dùng câu chữ thật đơn giản, xưng hô 'bác'.")

    return "\n".join(parts)


# ── Truy xuất tài liệu gốc ───────────────────────────────────────────────────


async def _retrieve(query: str) -> tuple[str, list[dict]]:
    """Tìm trích đoạn gốc từ ChromaDB. Kho rỗng hoặc lỗi thì trả về rỗng."""
    try:
        store = VectorStore()
        hits = await asyncio.to_thread(store.search, query=query, top_k=RETRIEVAL_TOP_K)
    except Exception as exc:
        logger.error("[quiz_context] truy xuất thất bại: %s", exc)
        return "", []

    if not hits:
        logger.warning("[quiz_context] không tìm được tài liệu nào cho: %.60s", query)
        return "", []

    blocks: list[str] = []
    citations: list[dict] = []
    for position, hit in enumerate(hits, start=1):
        meta = hit.metadata or {}
        title = meta.get("title") or f"Tài liệu {position}"
        blocks.append(f"[Nguồn {position} — {title}]\n{hit.text}")
        citations.append(
            {
                "id": position,
                "title": title,
                "issuer": meta.get("issuer") or "Cơ sở y tế",
                "doc_code": meta.get("doc_code"),
                "url": meta.get("url"),
                "snippet": hit.text[:300],
            }
        )

    return "\n\n".join(blocks)[:MAX_CONTEXT_CHARS], citations


# ── Ba builder ───────────────────────────────────────────────────────────────


async def build_from_article(db: AsyncSession, article_id: str, patient: Patient | None) -> QuizContext:
    """Nguồn ``article`` — dùng thẳng nội dung bài đã duyệt, KHÔNG truy xuất lại.

    Bài trong Thư viện vốn được ETL sinh ra từ chính tài liệu Bộ Y tế rồi qua
    vòng duyệt của biên tập viên. Đi truy xuất lại ChromaDB chỉ tổ mang về những
    đoạn KHÁC với thứ người bệnh vừa đọc, và đề sẽ hỏi ra ngoài bài học.
    """
    result = await db.execute(select(Article).filter(Article.id == article_id))
    article = result.scalars().first()
    if not article:
        raise QuizContextError(f"Không tìm thấy bài học {article_id}")

    body = article.full_content or article.content
    citations: list[dict] = []
    if article.origin_source:
        citations.append(
            {
                "id": 1,
                "title": article.title,
                "issuer": "Bộ Y tế Việt Nam",
                "doc_code": None,
                "url": None,
                "snippet": (article.content or "")[:300],
            }
        )

    return QuizContext(
        topic=article.title,
        context=body[:MAX_CONTEXT_CHARS],
        profile=describe_profile(patient),
        citations=citations,
        grounded=True,
    )


async def build_from_conversation(
    db: AsyncSession, conversation_id: str, patient_id: str | None, patient: Patient | None
) -> QuizContext:
    """Nguồn ``conversation`` — lấy chủ đề từ phiên chat, ra đề trên tài liệu gốc.

    Lọc theo ``patient_id`` ngay trong câu truy vấn: không có nó thì bất cứ ai
    đăng nhập cũng đoán được id phiên của người khác và đọc nội dung qua đường
    trả về của đề trắc nghiệm.
    """
    query = select(Conversation).options(selectinload(Conversation.messages)).filter(Conversation.id == conversation_id)
    if patient_id:
        query = query.filter(Conversation.patient_id == patient_id)

    result = await db.execute(query)
    conversation = result.scalars().first()
    if not conversation:
        raise QuizContextError(f"Không tìm thấy phiên hội thoại {conversation_id}")

    messages = list(conversation.messages)[-MAX_TRANSCRIPT_MESSAGES:]
    if not messages:
        raise QuizContextError("Phiên hội thoại chưa có nội dung để ra đề")

    # DÙNG THẲNG NỘI DUNG PHIÊN CHAT, KHÔNG TRUY XUẤT LẠI ChromaDB.
    #
    # Bản trước lấy câu hỏi làm truy vấn rồi đi tìm tài liệu gốc. Hai cái giá:
    #
    # - Chậm. Đo ngày 24/08/2026: dựng ngữ cảnh mất 4,12 giây chỉ vì một lượt
    #   embedding Cohere cộng một lần tìm kiếm. Cùng việc đó ở nguồn `profile`
    #   (đã bỏ truy xuất) mất 0,03 giây.
    # - Lệch. Tài liệu tìm về là những đoạn KHÁC với thứ người bệnh vừa đọc, nên
    #   đề hỏi ra ngoài phạm vi cuộc trò chuyện — đúng thứ nút bấm hứa sẽ không làm.
    #
    # Câu trả lời của trợ lý đã đi qua `generate_and_verify`, chỉ được gửi đi khi
    # bám được tài liệu đã duyệt. Nó vừa là nội dung có nguồn, vừa đúng là thứ
    # người bệnh vừa đọc.
    cap: list[str] = []
    cho_tra_loi: str | None = None
    for message in messages:
        noi_dung = (message.content or "").strip()
        if not noi_dung:
            continue
        if message.role == "user":
            cho_tra_loi = noi_dung
        elif cho_tra_loi and message.status in USABLE_ANSWER_STATUS:
            cap.append(f"Người học hỏi: {cho_tra_loi}\nTrợ lý đã trả lời: {noi_dung[:MAX_ANSWER_CHARS]}")
            cho_tra_loi = None

    if not cap:
        # Cả phiên chỉ có từ chối, cảnh báo cấp cứu hoặc chuyển bác sĩ — không
        # có kiến thức nào để hỏi lại.
        raise QuizContextError(
            "Cuộc trò chuyện này chưa có nội dung kiến thức để ra đề. Hãy hỏi trợ lý một câu về bệnh của bạn trước đã."
        )

    khoi = (
        "[ĐÃ TRAO ĐỔI TRONG PHIÊN NÀY — vừa là chủ đề, vừa là nguồn kiến thức]\n"
        + "\n\n".join(cap)
        + "\n\nRa đề kiểm tra đúng những chủ đề trên. Nội dung câu hỏi và đáp án lấy từ "
        "PHẦN TRỢ LÝ ĐÃ TRẢ LỜI, không lấy từ phần người học hỏi — câu hỏi của họ có "
        "thể chứa chính hiểu lầm mà họ đang mắc."
    )

    return QuizContext(
        topic=conversation.title or "Nội dung bạn vừa trao đổi",
        context=khoi[:MAX_CONTEXT_CHARS],
        profile=describe_profile(patient),
        citations=[],
        grounded=True,
    )


async def build_from_profile(db: AsyncSession, patient: Patient | None, patient_id: str | None) -> QuizContext:
    """Nguồn ``profile`` — ÔN TẬP TỔNG HỢP trên hành trình học của chính người này.

    Bản trước chỉ truy vấn ChromaDB theo tên bệnh, nên hai người cùng mắc tiểu
    đường nhận đề gần như giống nhau bất kể ai đã đọc bao nhiêu bài, ai đã hỏi
    những gì. Nó "cá nhân hoá" theo chẩn đoán chứ không theo con người.

    Nay đề dựng từ hai nguồn dấu vết mà hệ thống đã có sẵn:

    - **Bài đã hoàn thành** (``PatientProgress.completed_articles``) — thứ họ đã
      đọc và đã vượt qua. Ôn lại đúng phần này mới là ôn tập.
    - **Câu đã hỏi trợ lý** (``Conversation`` của họ) — quan trọng hơn cả. Một
      câu hỏi là dấu hiệu người bệnh CHƯA CHẮC về điều đó, nên đây là chỗ kiểm
      tra có giá trị nhất.

    Chưa học và chưa hỏi gì thì lùi về truy xuất theo bệnh như cũ — người mới
    vẫn phải có bài để làm.
    """
    if patient is None:
        raise QuizContextError("Cần khai hồ sơ bệnh nhân trước khi làm bài trắc nghiệm tổng hợp")

    da_hoc = await _completed_articles(db, patient_id)
    hoi_dap = await _asked_qa_pairs(db, patient_id)
    da_sai = await collect_mistakes(db, patient_id)

    if not (da_hoc or hoi_dap or da_sai):
        return await _fallback_by_condition(db, patient)

    # NGUỒN KIẾN THỨC phải luôn có, kể cả khi chưa hoàn thành bài nào.
    #
    # Prompt ra lệnh rất rõ: khối chỉ dấu (đã hỏi, đã sai) KHÔNG được dùng làm
    # nguồn nội dung. Người đã chat mười câu nhưng chưa đọc bài nào thì ngữ cảnh
    # chỉ còn toàn chỉ dấu — model tuân lệnh đúng và trả về mảng RỖNG, cả ba
    # lượt retry cùng trượt, người bệnh nhận 503.
    #
    # Nay câu TRẢ LỜI của trợ lý đóng vai nguồn kiến thức đó, nên chỉ phải truy
    # xuất ChromaDB khi không có cả bài đã học lẫn lịch sử trao đổi. Mỗi lượt
    # truy xuất tốn một lời gọi embedding Cohere cộng một lần tìm kiếm — bỏ được
    # là bớt được chừng đó khỏi thời gian người bệnh ngồi chờ.
    tai_lieu, citations_rag = "", []
    if not da_hoc and not hoi_dap:
        tai_lieu, citations_rag = await _retrieve(" ".join(m.question for m in da_sai[:8]))

    return _cumulative_context(patient, da_hoc, hoi_dap, da_sai, tai_lieu, citations_rag)


#: Số bài đã học gần nhất đưa vào đề. Lấy bài mới hoàn thành trước — kiến thức
#: vừa học là thứ đáng kiểm tra nhất, và cũng để không vượt trần ngữ cảnh.
MAX_COMPLETED_ARTICLES = 4

#: Số câu hỏi gần nhất của người bệnh lấy ra làm chủ đề.
MAX_ASKED_QUESTIONS = 10


async def _completed_articles(db: AsyncSession, patient_id: str | None) -> list[Article]:
    """Các bài người này đã hoàn thành, bài mới trước."""
    if not patient_id:
        return []

    result = await db.execute(select(PatientProgress).filter(PatientProgress.patient_id == patient_id))
    progress = result.scalars().first()
    ids = list(progress.completed_articles or []) if progress else []
    if not ids:
        return []

    # `completed_articles` là mảng JSONB nối thêm theo thứ tự hoàn thành, nên
    # phần đuôi là bài mới nhất.
    gan_nhat = ids[-MAX_COMPLETED_ARTICLES:]
    result = await db.execute(select(Article).filter(Article.id.in_(gan_nhat)))
    theo_id = {a.id: a for a in result.scalars().all()}

    # Giữ đúng thứ tự hoàn thành; bài đã bị xoá khỏi thư viện thì bỏ qua.
    return [theo_id[i] for i in reversed(gan_nhat) if i in theo_id]


async def _asked_qa_pairs(db: AsyncSession, patient_id: str | None) -> list[tuple[str, str]]:
    """Các cặp (câu hỏi, câu trả lời) trong lịch sử chat, mới nhất trước.

    VÌ SAO LẤY CẢ CÂU TRẢ LỜI CHỨ KHÔNG CHỈ CÂU HỎI:

    Bản trước chỉ lấy `role="user"`. Kết quả là ngữ cảnh chỉ có một danh sách
    thắc mắc trần trụi, không kèm bất kỳ kiến thức nào — nên phải đi truy xuất
    ChromaDB để có nguồn ra đề, tốn thêm một lượt gọi Cohere và một lượt tìm
    kiếm, mà tài liệu lấy về lại KHÁC với thứ người bệnh thật sự đã đọc.

    Câu trả lời của trợ lý đã đi qua `generate_and_verify` — nó chỉ được gửi đi khi
    bám được vào tài liệu đã duyệt. Nói cách khác nó ĐÃ LÀ nội dung có nguồn, và
    quan trọng hơn: nó đúng là thứ người bệnh đã đọc. Ra đề trên chính nó vừa
    sát hơn vừa bỏ được cả bước truy xuất.

    Lọc theo `status`: lời từ chối kê đơn, cảnh báo cấp cứu và câu chuyển bác sĩ
    không chứa kiến thức nào để hỏi lại.
    """
    if not patient_id:
        return []

    result = await db.execute(
        select(Message.conversation_id, Message.role, Message.content, Message.status)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Conversation.patient_id == patient_id)
        .order_by(Message.created_at.desc())
        .limit(MAX_ASKED_QUESTIONS * 4)
    )
    rows = list(result.all())

    # Đi từ mới nhất về cũ. Trong mỗi phiên, câu trả lời nằm NGAY SAU câu hỏi
    # theo thời gian, nên duyệt ngược thì gặp trả lời trước rồi mới tới hỏi.
    cap: list[tuple[str, str]] = []
    tra_loi_dang_cho: dict[str, str] = {}

    for conv_id, role, content, status in rows:
        if not content or not content.strip():
            continue

        if role == "assistant":
            if status in USABLE_ANSWER_STATUS:
                tra_loi_dang_cho[conv_id] = content.strip()[:MAX_ANSWER_CHARS]
            else:
                # Lượt này bị từ chối/cảnh báo — câu hỏi đi kèm nó cũng không có
                # kiến thức nào để hỏi lại, nên xoá chỗ chờ.
                tra_loi_dang_cho.pop(conv_id, None)
            continue

        # role == "user"
        tra_loi = tra_loi_dang_cho.pop(conv_id, None)
        if tra_loi:
            cap.append((content.strip(), tra_loi))
            if len(cap) >= MAX_ASKED_QUESTIONS:
                break

    return cap


def _cumulative_context(
    patient: Patient,
    da_hoc: list[Article],
    hoi_dap: list[tuple[str, str]],
    da_sai: list | None = None,
    tai_lieu: str = "",
    citations_rag: list[dict] | None = None,
) -> QuizContext:
    """Ghép các nguồn dấu vết thành ngữ cảnh, có nhãn rõ để prompt phân biệt.

    Ba tín hiệu, mạnh dần: đã học < đã hỏi < đã trả lời sai. Câu hỏi mới chỉ là
    "chưa chắc"; một câu trả lời sai là bằng chứng đã kiểm tra và trượt.

    ``tai_lieu`` là trích đoạn truy xuất từ ChromaDB, chỉ truyền vào khi CHƯA có
    bài đã học nào — nó đóng vai nguồn kiến thức thay cho khối ĐÃ HỌC. Không có
    nó thì prompt không còn gì hợp lệ để lấy nội dung ra đề.
    """
    da_sai = da_sai or []
    citations_rag = citations_rag or []
    khoi: list[str] = []

    if tai_lieu:
        khoi.append(f"[TÀI LIỆU THAM KHẢO — nguồn kiến thức để ra đề]\n{tai_lieu}")
    citations: list[dict] = []

    for i, article in enumerate(da_hoc, start=1):
        khoi.append(f"[ĐÃ HỌC {i} — {article.title}]\n{article.full_content or article.content}")
        citations.append(
            {
                "id": i,
                "title": article.title,
                "issuer": "Bộ Y tế Việt Nam",
                "doc_code": None,
                "url": None,
                "snippet": (article.content or "")[:300],
            }
        )

    if hoi_dap:
        # Cặp hỏi-đáp đóng HAI vai cùng lúc: chỉ dấu chủ đề người học chưa chắc,
        # VÀ nguồn kiến thức. Phần trả lời đã qua generate_and_verify nên chỉ được
        # gửi đi khi bám được vào tài liệu đã duyệt — nó đã là nội dung có nguồn,
        # và đúng là thứ người bệnh đã đọc.
        doan = [
            f"({i}) Người học hỏi: {hoi}\n    Trợ lý đã trả lời: {dap}" for i, (hoi, dap) in enumerate(hoi_dap, start=1)
        ]
        khoi.append(
            "[ĐÃ TRAO ĐỔI VỚI TRỢ LÝ — vừa là chủ đề chưa chắc, vừa là nguồn kiến thức]\n"
            + "\n\n".join(doan)
            + "\n\nMỗi câu hỏi ở đây là dấu hiệu người học CHƯA CHẮC về chủ đề đó — hãy ƯU "
            "TIÊN ra đề vào đúng những chủ đề này. Nội dung câu hỏi và đáp án lấy từ PHẦN "
            "TRỢ LÝ ĐÃ TRẢ LỜI, tuyệt đối không lấy từ phần người học hỏi: câu hỏi của họ "
            "có thể chứa chính hiểu lầm mà họ đang mắc."
        )

    if da_sai:
        dong = "\n".join(f"- {m.question} (sai {m.times_wrong} lần)" for m in da_sai[:MAX_MISTAKES_IN_PROMPT])
        khoi.append(
            "[ĐÃ TRẢ LỜI SAI — bằng chứng mạnh nhất về chỗ chưa nắm]\n"
            f"{dong}\n\n"
            "Ưu tiên các chủ đề này CAO HƠN cả khối ĐÃ TRAO ĐỔI. Ra câu hỏi mới kiểm "
            "tra lại chúng, nội dung vẫn lấy từ nguồn kiến thức, không chép nguyên văn."
        )

    phan = []
    if da_hoc:
        phan.append(f"{len(da_hoc)} bài đã học")
    if hoi_dap:
        phan.append(f"{len(hoi_dap)} lượt đã trao đổi")
    if da_sai:
        phan.append(f"{len(da_sai)} chỗ đã sai")

    # Citation của bài đã học đánh số từ 1; trích đoạn RAG nối tiếp sau đó để
    # hai nguồn không giẫm số của nhau.
    tat_ca_citations = list(citations)
    for i, c in enumerate(citations_rag, start=len(tat_ca_citations) + 1):
        tat_ca_citations.append({**c, "id": i})

    return QuizContext(
        topic=f"Ôn tập tổng hợp — {', '.join(phan)}",
        context="\n\n".join(khoi)[:MAX_CONTEXT_CHARS],
        profile=describe_profile(patient),
        citations=tat_ca_citations,
        # Bài trong thư viện đã qua vòng duyệt của biên tập viên, còn trích đoạn
        # RAG là tài liệu gốc — cả hai đều đối chiếu được. Chỉ khi KHÔNG có
        # nguồn nào (kho vector rỗng và chưa học bài nào) mới là không grounded.
        grounded=bool(da_hoc or tai_lieu or hoi_dap),
    )


#: Số chặng đầu của lộ trình dùng cho người mới. Ba bài đầu là phần nền tảng
#: nhất của mỗi lộ trình, và đủ chỗ cho 5-7 câu mà không vượt trần ngữ cảnh.
FIRST_LESSONS_FOR_NEWCOMER = 3


async def _fallback_by_condition(db: AsyncSession, patient: Patient) -> QuizContext:
    """Người mới chưa học chưa hỏi gì — ra đề theo GIÁO TRÌNH, không phải theo may rủi.

    Bản trước dựng một truy vấn chung chung ("kiến thức tự chăm sóc cho người
    bệnh tiểu đường, chế độ ăn, vận động...") rồi lấy top_k=6 từ ChromaDB. Kết
    quả phụ thuộc vào việc đoạn nào tình cờ gần truy vấn đó trong không gian
    vector — không có gì bảo đảm nó phủ đúng thứ người bệnh cần hiểu trước nhất,
    và hai người cùng bệnh có thể nhận đề lệch hẳn nhau vì lý do không ai giải
    thích được.

    Trong khi đó bảng ``learning_paths`` đã có sẵn một lộ trình được sắp thứ tự
    sư phạm cho từng bệnh — chính thứ tự mà Thư viện học tập dẫn người bệnh đi.
    Lấy các chặng đầu của lộ trình đó làm nguồn ra đề thì người mới được kiểm
    tra đúng phần nền tảng, theo đúng trình tự nhóm đã thiết kế.

    Lộ trình rỗng (chưa seed bài học) thì mới lùi về truy xuất vector.
    """
    result = await db.execute(
        select(Article)
        .join(LearningPath, LearningPath.article_id == Article.id)
        .filter(LearningPath.disease_category == patient.primary_condition)
        .order_by(LearningPath.day_number)
        .limit(FIRST_LESSONS_FOR_NEWCOMER)
    )
    bai_dau = list(result.scalars().all())

    primary = CONDITION_LABELS.get(patient.primary_condition, patient.primary_condition)

    if bai_dau:
        khoi: list[str] = []
        citations: list[dict] = []
        for i, article in enumerate(bai_dau, start=1):
            khoi.append(f"[CHẶNG {i} — {article.title}]\n{article.full_content or article.content}")
            citations.append(
                {
                    "id": i,
                    "title": article.title,
                    "issuer": "Bộ Y tế Việt Nam",
                    "doc_code": None,
                    "url": None,
                    "snippet": (article.content or "")[:300],
                }
            )

        return QuizContext(
            topic=f"Kiến thức nền tảng về {primary}",
            context="\n\n".join(khoi)[:MAX_CONTEXT_CHARS],
            profile=describe_profile(patient),
            citations=citations,
            grounded=True,
        )

    # Chưa seed lộ trình — lùi về truy xuất vector như trước.
    logger.warning(
        "[quiz_context] không có learning_path cho %s, lùi về truy xuất vector",
        patient.primary_condition,
    )
    comorbidities = [CONDITION_LABELS.get(c, c) for c in (patient.comorbidities or [])]
    terms = [primary, *comorbidities, "chế độ ăn", "vận động", "theo dõi chỉ số", "phòng biến chứng"]
    context, citations = await _retrieve(f"Kiến thức tự chăm sóc cho người bệnh {', '.join(terms)}")
    if not context:
        raise QuizContextError("Kho tài liệu chưa có nội dung phù hợp với hồ sơ của bạn")

    topic = f"Kiến thức nhập môn về {primary}"
    if comorbidities:
        topic += f" kèm {', '.join(comorbidities)}"

    return QuizContext(
        topic=topic,
        context=context,
        profile=describe_profile(patient),
        citations=citations,
        grounded=True,
    )


# ── Nguồn thứ tư: ôn lại chỗ đã sai ──────────────────────────────────────────


async def build_from_mistakes(db: AsyncSession, patient: Patient | None, patient_id: str | None) -> QuizContext:
    """Nguồn ``mistakes`` — ra đề MỚI trên đúng những khái niệm người học đã sai.

    VÌ SAO KHÔNG HIỆN LẠI NGUYÊN CÂU CŨ:

    Cho làm lại đúng câu cũ thì người học nhớ mặt đáp án chứ chưa chắc đã hiểu
    bài. Ra câu mới trên cùng khái niệm mới phân biệt được hai thứ đó — mà phân
    biệt được chính là điểm của cả vòng "Đánh giá".

    NGUỒN KIẾN THỨC lấy từ đâu: mỗi câu sai đều mang theo ``source_ref`` của
    lượt sinh ra nó. Là ``article_id`` thì đọc lại chính bài đó — người học sai
    ở đâu, ôn lại đúng chỗ ấy. Không có thì truy xuất ChromaDB theo nội dung câu.
    """
    if patient is None:
        raise QuizContextError("Cần khai hồ sơ bệnh nhân trước khi ôn lại câu sai")

    mistakes = await collect_mistakes(db, patient_id)
    if not mistakes:
        raise QuizContextError("Bạn chưa có câu nào trả lời sai. Hãy làm một bài trắc nghiệm trước đã.")

    context, citations = await _material_for_mistakes(db, mistakes)
    if not context:
        raise QuizContextError("Không tìm lại được tài liệu gốc cho những câu bạn đã sai")

    # Liệt kê chỗ sai để prompt biết nhắm vào đâu. Ghi kèm đáp án người học đã
    # chọn: hiểu nhầm cụ thể mới là thứ cần đánh trúng, chứ không phải chủ đề chung.
    dong_sai: list[str] = []
    for m in mistakes[:MAX_MISTAKES_IN_PROMPT]:
        da_chon = m.options[m.chosen[0]] if m.chosen and 0 <= m.chosen[0] < len(m.options) else "bỏ trống"
        dung = m.options[m.correct_index] if 0 <= m.correct_index < len(m.options) else "?"
        lap = f" (sai {m.times_wrong} lần)" if m.times_wrong > 1 else ""
        dong_sai.append(f"- Đã hỏi: {m.question}{lap}\n  Người học chọn: {da_chon}\n  Đáp án đúng: {dung}")

    khoi_sai = (
        "[ĐÃ TRẢ LỜI SAI — những chỗ người học thật sự chưa nắm]\n"
        + "\n".join(dong_sai)
        + "\n\nĐây KHÔNG phải nguồn kiến thức. Hãy ra câu hỏi MỚI kiểm tra cùng những khái "
        "niệm trên, diễn đạt khác đi, với nội dung lấy từ phần tài liệu ở trên. "
        "TUYỆT ĐỐI không chép lại nguyên văn câu đã hỏi — người học có thể chỉ đang nhớ "
        "mặt đáp án chứ chưa hiểu bài."
    )

    return QuizContext(
        topic=f"Ôn lại {len(mistakes)} chỗ chưa nắm",
        context=(context + "\n\n" + khoi_sai)[:MAX_CONTEXT_CHARS],
        profile=describe_profile(patient),
        citations=citations,
        grounded=True,
    )


async def _material_for_mistakes(db: AsyncSession, mistakes: list) -> tuple[str, list[dict]]:
    """Gom tài liệu gốc cho các câu sai: ưu tiên bài học, còn lại thì truy xuất."""
    article_ids = {m.source_ref for m in mistakes if m.source_ref and m.source_ref.startswith("a_")}

    khoi: list[str] = []
    citations: list[dict] = []

    if article_ids:
        result = await db.execute(select(Article).filter(Article.id.in_(article_ids)))
        for i, article in enumerate(result.scalars().all(), start=1):
            khoi.append(f"[TÀI LIỆU {i} — {article.title}]\n{article.full_content or article.content}")
            citations.append(
                {
                    "id": i,
                    "title": article.title,
                    "issuer": "Bộ Y tế Việt Nam",
                    "doc_code": None,
                    "url": None,
                    "snippet": (article.content or "")[:300],
                }
            )

    if not khoi:
        # Câu sai đến từ chat hoặc từ đề tổng hợp — không có bài nào để đọc lại.
        # Dựng truy vấn từ chính nội dung các câu đã sai.
        truy_van = " ".join(m.question for m in mistakes[:5])
        van_ban, cits = await _retrieve(truy_van)
        return van_ban, cits

    return "\n\n".join(khoi), citations
