"""Tầng dữ liệu của Medical AI Agent — từ file gốc đến vector store.

Chủ sở hữu: Khanh Nguyen. Xem docs/ownership.md.

Luồng: registry -> parse (Docling) -> structure (sửa cấu trúc tài liệu)
       -> chunk (cắt + gắn metadata) -> store (embed + Chroma).
"""
