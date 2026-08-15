"""Điều phối toàn bộ pipeline dữ liệu và cung cấp CLI.

    python -m src.rag.pipeline parse            # chỉ parse, ghi cache ra data/interim
    python -m src.rag.pipeline build            # parse -> sửa cấu trúc -> chunk -> chunks.jsonl
    python -m src.rag.pipeline index            # embed chunks.jsonl -> Chroma
    python -m src.rag.pipeline all              # chạy cả ba bước
    python -m src.rag.pipeline query "..."      # thử truy xuất
    python -m src.rag.pipeline stats            # xem trong store đang có gì
    python -m src.rag.pipeline inspect <doc_id> # in vài chunk để soi bằng mắt

Mỗi lần build đều ghi lại data/processed/manifest.json — file này ĐƯỢC COMMIT,
nên nhìn lịch sử git là biết lần ingest nào đổi gì: bao nhiêu chunk, bỏ bao nhiêu
khối vì lý do gì, cấu hình lúc đó ra sao.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

from src.rag.chunk import Chunk, preview
from src.rag.config import get_rag_settings
from src.rag.registry import Registry, SourceDoc, load_registry, verify_sources
from src.rag.structure import repair_document

logger = logging.getLogger("rag.pipeline")

PIPELINE_VERSION = "1.0.0"


def _setup_logging(verbose: bool = True) -> None:
    logging.basicConfig(
        level=logging.INFO if verbose else logging.WARNING,
        format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
        datefmt="%H:%M:%S",
        stream=sys.stdout,
    )
    # Docling nói rất nhiều, hạ xuống cho log đọc được.
    for noisy in ("docling", "docling_core", "httpx", "urllib3", "chromadb"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


# -----------------------------------------------------------------------------
# Các bước
# -----------------------------------------------------------------------------


def step_parse(registry: Registry, force: bool = False) -> None:
    from src.rag.parse import parse_document

    settings = get_rag_settings()
    verify_sources(registry, settings)
    for doc in registry.approved():
        parse_document(doc, settings, force=force)
    logger.info("parse xong %d tài liệu", len(registry.approved()))


def build_one(doc: SourceDoc, force_parse: bool = False, catalog=None) -> tuple[list[Chunk], dict]:
    """Parse -> sửa cấu trúc -> chunk cho một tài liệu, kèm số liệu kiểm chứng.

    Phần xử lý dữ liệu gọi thẳng ingest.process, đúng hàm mà luồng biên tập
    viên tải tài liệu lên cũng dùng — để tài liệu upload và tài liệu nền không
    bao giờ được chunk theo hai kiểu khác nhau.
    """
    from src.rag.ingest import process
    from src.rag.parse import parse_document, to_elements

    settings = get_rag_settings()

    if force_parse:
        parse_document(doc, settings, force=True)

    chunks, drops, repair_counts = process(doc, settings, catalog=catalog)

    # Số khối trước khi sửa, chỉ dùng cho báo cáo kiểm chứng.
    raw_elements = to_elements(parse_document(doc, settings))
    repaired = repair_document(list(raw_elements), doc_title=doc.citation_title)

    pages = [e.page for e in raw_elements if e.page is not None]
    tokens = [c.metadata["token_count"] for c in chunks]

    report = {
        "doc_id": doc.doc_id,
        "file": doc.file,
        "source_sha256": _file_sha256(settings.raw_dir / doc.file),
        "lang": doc.lang,
        "published": doc.published,
        "recency_rank": doc.recency_rank,
        "priority": doc.priority,
        "pages_seen": max(pages) if pages else 0,
        "elements_raw": len(raw_elements),
        "elements_after_repair": len(repaired),
        "repairs": dict(sorted(repair_counts.items())),
        "dropped": drops.as_dict(),
        "chunks": len(chunks),
        "tokens_total": sum(tokens),
        "tokens_avg": round(sum(tokens) / len(tokens), 1) if tokens else 0,
        "tokens_max": max(tokens) if tokens else 0,
        "chunks_with_threshold": sum(1 for c in chunks if c.metadata["has_threshold"]),
        "chunks_table": sum(1 for c in chunks if c.metadata["kind"] == "table"),
    }
    return chunks, report


def step_build(registry: Registry, force_parse: bool = False) -> list[Chunk]:
    settings = get_rag_settings()
    verify_sources(registry, settings)
    settings.processed_dir.mkdir(parents=True, exist_ok=True)

    all_chunks: list[Chunk] = []
    reports = []
    for doc in registry.approved():
        chunks, report = build_one(doc, force_parse=force_parse, catalog=registry.catalog)
        all_chunks.extend(chunks)
        reports.append(report)
        logger.info(
            "%-24s -> %4d chunk | bỏ %s | sửa %s",
            doc.doc_id,
            report["chunks"],
            report["dropped"],
            report["repairs"] or "{}",
        )

    out = settings.processed_dir / "chunks.jsonl"
    with out.open("w", encoding="utf-8") as f:
        for c in all_chunks:
            f.write(
                json.dumps(
                    {
                        "chunk_id": c.chunk_id,
                        "doc_id": c.doc_id,
                        "text": c.text,
                        "embed_text": c.embed_text,
                        "metadata": c.metadata,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    manifest = {
        "pipeline_version": PIPELINE_VERSION,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "ranking_policy": registry.ranking_policy,
        "config": {
            "chunk_max_tokens": settings.chunk_max_tokens,
            "chunk_overlap_tokens": settings.chunk_overlap_tokens,
            "chunk_min_chars": settings.chunk_min_chars,
            "table_max_tokens": settings.table_max_tokens,
            "dedup_jaccard_threshold": settings.dedup_jaccard_threshold,
            "embedding_model": settings.embedding_model,
            "embedding_dimensions": settings.embedding_dimensions,
        },
        "totals": {
            "documents": len(reports),
            "chunks": len(all_chunks),
            "tokens": sum(r["tokens_total"] for r in reports),
        },
        "documents": reports,
    }
    (settings.processed_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    logger.info("ghi %d chunk vào %s", len(all_chunks), out)
    return all_chunks


def load_chunks() -> list[Chunk]:
    settings = get_rag_settings()
    path = settings.processed_dir / "chunks.jsonl"
    if not path.exists():
        raise FileNotFoundError(f"Chưa có {path}. Chạy `python -m src.rag.pipeline build` trước.")
    chunks = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            chunks.append(
                Chunk(
                    chunk_id=d["chunk_id"],
                    doc_id=d["doc_id"],
                    text=d["text"],
                    embed_text=d["embed_text"],
                    metadata=d["metadata"],
                )
            )
    return chunks


def step_index(chunks: list[Chunk] | None = None, reset: bool = False) -> None:
    from src.rag.store import VectorStore

    chunks = chunks if chunks is not None else load_chunks()
    store = VectorStore()
    if reset:
        store.reset()
        logger.info("đã xoá collection cũ")
    n = store.upsert(chunks)
    logger.info("nạp %d chunk vào Chroma, tổng trong store: %d", n, store.count())


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------


def _cmd_query(args) -> None:
    from src.rag.store import VectorStore

    store = VectorStore()
    hits = store.search(args.text, disease=args.disease, top_k=args.top_k)
    if not hits:
        print("Không có chunk nào vượt ngưỡng min_similarity -> luồng doctor_referral.")
        return
    for i, h in enumerate(hits, 1):
        m = h.metadata
        flag = " [CÓ NGƯỠNG CHẨN ĐOÁN]" if m.get("has_threshold") else ""
        print(f"\n--- [{i}] sim={h.similarity:.3f} score={h.score:.3f}{flag}")
        print(f"    {m['issuer']} · {m['published']} · rank={m['recency_rank']} · {m['lang']}")
        print(f"    {m['section_path'][:110]}")
        print(f"    trang {m['page_start']}-{m['page_end']}")
        print("    " + " ".join(h.text.split())[:300])


def _cmd_inspect(args) -> None:
    chunks = [c for c in load_chunks() if c.doc_id == args.doc_id]
    if not chunks:
        print(f"Không có chunk nào của doc_id={args.doc_id}")
        return
    print(f"{args.doc_id}: {len(chunks)} chunk\n")
    step = max(1, len(chunks) // args.n)
    for c in chunks[::step][: args.n]:
        m = c.metadata
        print(f"--- {c.chunk_id}  ({m['token_count']} token, trang {m['page_start']}-{m['page_end']})")
        print(preview(c, width=400))
        print()


def _cmd_stats(_args) -> None:
    from src.rag.store import VectorStore

    settings = get_rag_settings()
    manifest_path = settings.processed_dir / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        print(f"manifest: build lúc {manifest['built_at']}, chính sách {manifest['ranking_policy']}")
        print(
            f"  {manifest['totals']['documents']} tài liệu, {manifest['totals']['chunks']} chunk, "
            f"{manifest['totals']['tokens']:,} token"
        )
        for d in manifest["documents"]:
            print(f"  - {d['doc_id']:<24} {d['chunks']:>4} chunk  bỏ={d['dropped']}")
    try:
        print("\nvector store:", VectorStore().stats())
    except Exception as e:  # store chưa dựng thì cũng không sao
        print("\nvector store: chưa sẵn sàng —", e)


def _cmd_editor(args) -> int:
    """Các lệnh của luồng biên tập viên. In ra thông báo đọc được cho người dùng."""
    from src.rag import ingest

    try:
        if args.cmd == "upload":
            path = Path(args.path)
            result = ingest.stage_upload(
                path.name,
                path.read_bytes(),
                title=args.title,
                issuer=args.issuer,
                published=args.published,
                diseases=args.disease,
                lang=args.lang,
                authority=args.authority,
                doc_code=args.doc_code,
                uploaded_by=args.by,
            )
            print(f"{result.doc_id}: {result.message}")
            print(f"Duyệt bằng: python -m src.rag.pipeline approve {result.doc_id} --by <tên bạn>")

        elif args.cmd == "pending":
            items = ingest.list_pending()
            if not items:
                print("Không có tài liệu nào đang chờ duyệt.")
                return 0
            print(f"{len(items)} tài liệu chờ duyệt:\n")
            for it in items:
                print(f"  {it['doc_id']}")
                print(f"    {it['title']} — {it['issuer']}, {it['published']}")
                print(f"    bệnh: {', '.join(it['diseases'])} | tải lên: {it['uploaded_at']} bởi {it['uploaded_by']}")

        elif args.cmd == "approve":
            result = ingest.approve(args.doc_id, args.by)
            print(f"{result.message}")
            print(f"  bỏ: {result.dropped}")
            print(f"  sửa cấu trúc: {result.repairs or '{}'}")

        elif args.cmd == "reject":
            result = ingest.reject(args.doc_id, args.reason, args.by)
            print(result.message)

        elif args.cmd == "remove":
            result = ingest.remove(args.doc_id)
            print(result.message)

    except ingest.IngestError as e:
        print(f"Lỗi: {e}")
        return 1
    except KeyError as e:
        print(f"Lỗi: {e}")
        return 1
    return 0


def _disease_choices() -> list[str] | None:
    """Mã bệnh hợp lệ cho CLI, đọc từ registry.

    Trả None nếu chưa nạp được registry, để `--help` vẫn chạy được thay vì nổ.
    """
    try:
        return load_registry().catalog.ids
    except Exception:
        return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="src.rag.pipeline", description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("parse", help="chỉ parse, ghi cache")
    p.add_argument("--force", action="store_true", help="parse lại kể cả khi đã có cache")

    p = sub.add_parser("build", help="parse -> sửa cấu trúc -> chunk")
    p.add_argument("--force-parse", action="store_true")

    p = sub.add_parser("index", help="embed và nạp vào Chroma")
    p.add_argument("--reset", action="store_true", help="xoá collection trước khi nạp")

    p = sub.add_parser("all", help="build rồi index")
    p.add_argument("--reset", action="store_true")
    p.add_argument("--force-parse", action="store_true")

    p = sub.add_parser("query", help="thử truy xuất")
    p.add_argument("text")
    # Danh sách bệnh lấy từ registry, không liệt kê cứng ở đây.
    p.add_argument("--disease", choices=_disease_choices(), default=None)
    p.add_argument("--top-k", type=int, default=None)

    p = sub.add_parser("inspect", help="in vài chunk của một tài liệu")
    p.add_argument("doc_id")
    p.add_argument("-n", type=int, default=5)

    sub.add_parser("stats", help="thống kê manifest và vector store")

    # -- luồng biên tập viên ---------------------------------------------------
    # Có sẵn ở CLI để team thử được quy trình duyệt tài liệu ngay, không phải
    # chờ giao diện admin làm xong. Phía API gọi thẳng các hàm trong src/rag/ingest.py.
    p = sub.add_parser("upload", help="[biên tập viên] nạp một tài liệu vào hàng chờ duyệt")
    p.add_argument("path")
    p.add_argument("--title", required=True)
    p.add_argument("--issuer", required=True)
    p.add_argument("--published", required=True, help="YYYY, YYYY-MM hoặc YYYY-MM-DD")
    p.add_argument("--disease", action="append", required=True, choices=_disease_choices())
    p.add_argument("--lang", default="vi", choices=["vi", "en"])
    p.add_argument("--authority", default="vn_moh", choices=["vn_moh", "international"])
    p.add_argument("--doc-code", default=None)
    p.add_argument("--by", default=None, help="ai tải lên")

    sub.add_parser("pending", help="[biên tập viên] xem tài liệu đang chờ duyệt")

    p = sub.add_parser("approve", help="[biên tập viên] duyệt và nạp vào thư viện (CHẬM)")
    p.add_argument("doc_id")
    p.add_argument("--by", required=True, help="ai duyệt")

    p = sub.add_parser("reject", help="[biên tập viên] từ chối tài liệu đang chờ")
    p.add_argument("doc_id")
    p.add_argument("--reason", action="append", required=True)
    p.add_argument("--by", required=True)

    p = sub.add_parser("remove", help="[biên tập viên] gỡ tài liệu khỏi thư viện")
    p.add_argument("doc_id")

    args = parser.parse_args(argv)
    _setup_logging(not args.quiet)

    if args.cmd in ("upload", "pending", "approve", "reject", "remove"):
        return _cmd_editor(args)

    if args.cmd == "query":
        _cmd_query(args)
    elif args.cmd == "inspect":
        _cmd_inspect(args)
    elif args.cmd == "stats":
        _cmd_stats(args)
    elif args.cmd == "parse":
        step_parse(load_registry(), force=args.force)
    elif args.cmd == "build":
        step_build(load_registry(), force_parse=args.force_parse)
    elif args.cmd == "index":
        step_index(reset=args.reset)
    elif args.cmd == "all":
        chunks = step_build(load_registry(), force_parse=args.force_parse)
        step_index(chunks, reset=args.reset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
