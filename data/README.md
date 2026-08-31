# Thư mục data

File PDF/PPTX **không nằm trong git** (dung lượng lớn, và một số tài liệu có
ràng buộc bản quyền). `registry.yaml` và `processed/manifest.json` được commit.
Các trạng thái phát sinh khi vận hành do máy chủ quản lý, không đưa vào Git.

## Các thư mục

| Thư mục | Nội dung | Trong git? |
| :-- | :-- | :-- |
| `raw/` | Tài liệu gốc, không bao giờ sửa | Không |
| `interim/docling/` | Kết quả parse của Docling, dạng JSON — cache để khỏi parse lại | Không |
| `interim/markdown/` | Cùng nội dung nhưng dạng markdown, để mở ra đọc bằng mắt mà kiểm tra parse có đúng không | Không |
| `processed/chunks.jsonl` | Chunk cuối cùng kèm metadata | Không |
| `processed/manifest.json` | Số liệu của mỗi lần build: bao nhiêu chunk, bỏ bao nhiêu khối vì lý do gì | **Có** |
| `vectorstore/` | Chroma persist | Không |
| `quarantine/` | Tài liệu đã xem xét và loại, lý do ghi trong `registry.yaml` | Không |
| `registry.yaml` | Danh mục bệnh + tài liệu nền đã duyệt được biên soạn cùng mã nguồn | **Có** |
| `registry_runtime.yaml` | Bệnh do BTV thêm trong giao diện; được merge khi RAG khởi động/đọc dữ liệu | Không |
| `uploads.json` | Tài liệu do biên tập viên tải lên lúc chạy, do máy ghi | Không |

## Embedding

Mặc định dùng **BAAI/bge-m3 chạy local** (`RAG_EMBEDDING_PROVIDER=local`): miễn phí,
offline, không phụ thuộc hạn mức API nên ai ingest lại bao nhiêu lần cũng được.

Lần chạy đầu tải khoảng 2.2GB model. Embed toàn bộ 1427 chunk trên CPU mất khoảng
30–60 phút — chỉ một lần, sau đó vector nằm trong `data/vectorstore/`.

**Trước khi deploy phải quyết định lại.** Server cần chính model đó để embed câu hỏi
của người dùng, tức là cần khoảng 2.5GB RAM. Free tier của Render chỉ có 512MB nên
không chạy nổi. Hai lựa chọn:

- Đổi `RAG_EMBEDDING_PROVIDER=openai` (hoặc thêm provider khác) rồi `make rag-index`
- Thuê instance lớn hơn

Đổi provider **bắt buộc index lại** vì số chiều vector khác nhau (local 1024,
OpenAI 1536). Lớp `Embedder` trong `src/rag/store.py` đã tách sẵn nên thêm provider
mới chỉ là viết một class có đúng một phương thức `embed()`.

## Thêm bệnh mới

Trong vận hành, BTV mở **Danh mục bệnh**, thêm mã bệnh, tên tiếng Việt và các
tên gọi khác. Hệ thống ghi nguyên tử vào `registry_runtime.yaml`, rồi merge với
`registry.yaml` mỗi khi đọc registry; không cần sửa code, sửa YAML nền hay deploy
lại. Bệnh mới ở trạng thái **Chờ tài liệu nguồn**, có thể chọn ngay khi tải tài
liệu nhưng chưa xuất hiện trong hồ sơ bệnh nhân và RAG.

Sau khi một tài liệu cho bệnh đó được duyệt, parse → chunk → embedding → index
thành công, bệnh tự chuyển sang **Đang dùng**. Từ thời điểm đó nó có trong danh
mục hồ sơ bệnh nhân và được retrieval cho phép dùng. Tạm ngừng bệnh sẽ loại toàn
bộ tài liệu của bệnh đó khỏi retrieval nhưng không xoá vector; có thể bật lại khi
vẫn còn ít nhất một tài liệu đã duyệt.

`registry_runtime.yaml` và `uploads.json` phải nằm trên persistent volume khi
deploy. Có thể đặt đường dẫn khác bằng `RAG_RUNTIME_REGISTRY_PATH`; nếu không,
mỗi lần thay container mà không có volume thì dữ liệu BTV thêm sẽ mất. Muốn đưa
một bệnh thành danh mục nền được review cùng source code thì vẫn sửa
`registry.yaml` qua Pull Request.

## Luồng biên tập viên tải tài liệu lên

Tài liệu mới **không tự vào thư viện**. Phải có người duyệt — brief mục 7.1 yêu cầu
hệ thống chỉ trả lời từ tài liệu đã kiểm.

```bash
python -m src.rag.pipeline upload duong/dan/file.pdf \
    --title "Hướng dẫn ..." --issuer "Bộ Y tế" --published 2026 \
    --disease hypertension --by "tên bạn"

python -m src.rag.pipeline pending                       # xem hàng chờ
python -m src.rag.pipeline approve <doc_id> --by "tên bạn"   # duyệt, CHẬM vài phút
python -m src.rag.pipeline reject  <doc_id> --reason "..." --by "tên bạn"
python -m src.rag.pipeline remove  <doc_id>              # gỡ khỏi thư viện
```

Phía API gọi thẳng các hàm trong `src/rag/ingest.py`. Lưu ý `approve()` chạy
Docling nên mất vài phút — đẩy sang `BackgroundTasks` chứ đừng chặn request.

## Lấy file gốc ở đâu

Tên file trong `raw/` phải khớp đúng trường `file` của `registry.yaml`:

```
raw/ada-soc-2026-t2dm-slides.pptx
raw/aha-acc-2025-htn.pdf
raw/esc-2024-htn.pdf
raw/vn-moh-5481-2020-t2dm.pdf
raw/vn-moh-3192-2010-htn.pdf
```

Hỏi Khanh để lấy bộ file, hoặc tải lại theo trường `url` trong `registry.yaml`
(một số tài liệu chưa điền url, đang chờ biên tập viên bổ sung).

Màn **Biên tập viên → Tài liệu nguồn** chỉ mở toàn văn khi file thật có trong
`raw/`: PDF được xem nguyên bản, còn Markdown được render theo GFM. Nếu máy chủ
chỉ có vector store (như môi trường clone mới) thì giao diện sẽ nói rõ “Bản gốc
chưa có trên máy chủ này”; không tạo preview từ chunk hay dùng dữ liệu thay thế.

## Chạy pipeline

```bash
make rag-parse    # chỉ cần chạy một lần, kết quả được cache
make rag-build    # sinh chunks.jsonl và manifest.json
make rag-index    # embed và nạp vào Chroma, cần OPENAI_API_KEY
make rag-stats    # xem đang có gì trong store
```

Với tài liệu nền, thêm hoặc bỏ tài liệu thì sửa `registry.yaml` rồi mở Pull
Request — đây là bước duyệt nội dung, cần một người thứ hai đọc lại chứ không tự
merge. Tài liệu BTV tải trong giao diện đi theo hàng đợi duyệt, không sửa file
nền.
