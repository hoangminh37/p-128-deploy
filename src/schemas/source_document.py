"""Schemas for reading an approved source document from the RAG library."""

from pydantic import BaseModel, Field


class SourceTableCell(BaseModel):
    """One cell with coordinates preserved from the document parser."""

    text: str
    row: int = Field(..., ge=0)
    column: int = Field(..., ge=0)
    row_span: int = Field(default=1, ge=1)
    column_span: int = Field(default=1, ge=1)
    is_column_header: bool = False
    is_row_header: bool = False


class SourceTable(BaseModel):
    """Structured source table; never inferred from natural-language cell text."""

    rows: int = Field(..., ge=1)
    columns: int = Field(..., ge=1)
    cells: list[SourceTableCell] = Field(default_factory=list)


class SourceDocumentChunk(BaseModel):
    """One approved vector-store chunk, presented as a readable document section."""

    chunk_id: str
    content: str
    section_path: str | None = None
    page_start: int | None = Field(default=None, ge=1)
    page_end: int | None = Field(default=None, ge=1)
    table: SourceTable | None = None


class SourceDocumentResponse(BaseModel):
    """Approved document content plus the exact chunk cited by the agent."""

    document_id: str
    title: str
    issuer: str
    doc_code: str | None = None
    url: str | None = None
    published: str
    highlighted_chunk_id: str
    total_chunks: int = Field(..., ge=1)
    chunks: list[SourceDocumentChunk]
