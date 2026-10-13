"""Build small, real PDF files for tests (no reportlab dependency).

make_pdf(["page one text", "", "page three text"]) returns bytes for a
3-page PDF whose second page has no text, so page-number preservation can be
tested end to end through pypdf.
"""
from __future__ import annotations

import io

from pypdf import PdfReader, PdfWriter


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[str]) -> bytes:
    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)

    catalog_id = add(b"")  # placeholder, filled below
    pages_id = add(b"")
    font_id = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids = []
    for text in pages:
        lines = text.split("\n") if text else []
        ops = ["BT", "/F1 11 Tf", "14 TL", "50 780 Td"]
        for line in lines:
            ops.append(f"({_escape(line)}) Tj T*")
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        content_id = add(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
        page_ids.append(add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
            b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (pages_id, font_id, content_id)
        ))

    objects[catalog_id - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id
    kids = b" ".join(b"%d 0 R" % pid for pid in page_ids)
    objects[pages_id - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + obj + b"\nendobj\n")
    xref_at = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, catalog_id, xref_at))
    return out.getvalue()


def make_encrypted_pdf(pages: list[str], password: str = "secret") -> bytes:
    reader = PdfReader(io.BytesIO(make_pdf(pages)))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(user_password=password, owner_password=password)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()
