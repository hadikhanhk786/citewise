"""Grounded (evidence-only) answers with verified PDF page citations.

Pipeline:
  retrieved chunks -> labelled evidence [C1..Cn] -> model returns JSON
  {answer, citations:[{ref, quote}], insufficient_evidence}
  -> validate_model_output() keeps only citations that point at a chunk we
  actually retrieved, takes document/page from that chunk (never from the
  model), checks quotes really occur in the chunk text, and renumbers the
  answer's markers to [1], [2], ...

Everything here is pure so it can be unit-tested without a model or database.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict
from typing import Any, Iterable, Optional

ANSWERED = "ANSWERED"
INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"

INSUFFICIENT_MESSAGE = (
    "I couldn't establish an answer to this from the selected document(s). "
    "None of the passages I found contain enough evidence to support an answer. "
    "Try rephrasing the question or selecting a different document."
)
UNVERIFIABLE_MESSAGE = (
    "I couldn't produce an answer that could be verified against the document(s), "
    "so I'm not showing one. Try rephrasing the question."
)

MIN_QUOTE_CHARS = 12
MAX_EXCERPT_CHARS = 500


@dataclass(frozen=True)
class Evidence:
    ref: str  # "C1", "C2", ...
    chunk_id: str
    document_id: str
    title: str
    page: int
    text: str


@dataclass
class VerifiedCitation:
    ordinal: int
    chunkId: str
    documentId: str
    title: str
    page: int
    excerpt: str
    quoteVerified: bool


@dataclass
class GroundedResult:
    status: str
    answer: str
    citations: list[VerifiedCitation] = field(default_factory=list)
    # Diagnostics only (logged, never shown as evidence)
    rejectedRefs: list[str] = field(default_factory=list)
    reason: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "answer": self.answer,
            "citations": [asdict(c) for c in self.citations],
            "rejectedRefs": self.rejectedRefs,
            "reason": self.reason,
        }


def insufficient(reason: str, message: str = INSUFFICIENT_MESSAGE, rejected: Iterable[str] = ()) -> GroundedResult:
    return GroundedResult(status=INSUFFICIENT_EVIDENCE, answer=message, rejectedRefs=list(rejected), reason=reason)


# ── Evidence & prompt ──────────────────────────────────────────────────

def build_evidence(chunks: Iterable[Any]) -> list[Evidence]:
    """Turn RagChunk rows into labelled evidence. Chunks without a page are skipped."""
    evidence: list[Evidence] = []
    for chunk in chunks:
        meta = chunk.metadata_ or {}
        page = meta.get("page")
        if not isinstance(page, int) or page < 1:
            continue
        evidence.append(Evidence(
            ref=f"C{len(evidence) + 1}",
            chunk_id=str(chunk.id),
            document_id=str(chunk.source_id),
            title=str(meta.get("title") or "Untitled document"),
            page=page,
            text=chunk.content,
        ))
    return evidence


_ANSWER_SYSTEM = """You are a careful research assistant for consultants. You answer questions using ONLY the evidence passages provided. You never use outside knowledge.

Each evidence passage is labelled like [C1], [C2]. Rules:
1. Every factual sentence in your answer must end with the label(s) of the passage(s) that support it, e.g. "Revenue grew 12% [C2]."
2. Only use labels that appear in the evidence. Never invent labels.
3. Do NOT mention page numbers or file names yourself; the labels are enough.
4. For each label you use, copy a short exact quote (one sentence or phrase, word for word) from that passage that supports your answer.
5. If the evidence does not contain the answer, set "insufficient_evidence" to true and leave "answer" empty. Do not guess.

Respond with JSON only, in exactly this shape:
{"answer": "text with [C1] markers", "citations": [{"ref": "C1", "quote": "exact words from C1"}], "insufficient_evidence": false}"""

_SUMMARY_SYSTEM = """You are a careful research assistant for consultants. Summarise the document using ONLY the evidence passages provided, which are excerpts in document order. You never use outside knowledge.

Each evidence passage is labelled like [C1], [C2]. Rules:
1. Write a concise summary (an overview sentence, then 3-6 short bullet points starting with "- ").
2. Every sentence or bullet must end with the label(s) of the passage(s) that support it, e.g. "- The study surveyed 400 firms [C3]."
3. Only use labels that appear in the evidence. Never invent labels. Do NOT mention page numbers yourself.
4. For each label you use, copy a short exact quote (word for word) from that passage.
5. If the passages contain no meaningful content to summarise, set "insufficient_evidence" to true.

Respond with JSON only, in exactly this shape:
{"answer": "summary with [C1] markers", "citations": [{"ref": "C1", "quote": "exact words from C1"}], "insufficient_evidence": false}"""


def _format_evidence(evidence: list[Evidence]) -> str:
    return "\n\n".join(f"[{e.ref}] (from \"{e.title}\")\n{e.text}" for e in evidence)


def build_answer_prompt(question: str, evidence: list[Evidence]) -> tuple[str, str]:
    user = f"Evidence:\n\n{_format_evidence(evidence)}\n\nQuestion: {question}\n\nJSON answer:"
    return _ANSWER_SYSTEM, user


def build_summary_prompt(evidence: list[Evidence]) -> tuple[str, str]:
    user = f"Evidence:\n\n{_format_evidence(evidence)}\n\nJSON summary:"
    return _SUMMARY_SYSTEM, user


# ── Parsing ────────────────────────────────────────────────────────────

def parse_model_json(raw: Any) -> Optional[dict]:
    """Parse model output into a dict, tolerating code fences and leading prose."""
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
    return data if isinstance(data, dict) else None


# ── Validation ─────────────────────────────────────────────────────────

_REF_TOKEN = re.compile(r"^\s*\[?\s*C?\s*(\d{1,3})\s*\]?\s*$", re.IGNORECASE)
# A marker group like [C1], [C1, C3], [C1][C2] (each bracket handled separately), or [1]
_MARKER_GROUP = re.compile(r"\[\s*(C?\s*\d{1,3}(?:\s*[,;]\s*C?\s*\d{1,3})*)\s*\]", re.IGNORECASE)
_PAGE_MENTION = re.compile(
    r"\s*\(\s*(?:p\.|pp\.|page|pages)\s*\d+(?:\s*[-–,]\s*\d+)*\s*\)"  # "(page 4)", "(p. 4)"
    r"|\b(?:on|at|see)\s+(?:p\.|page)\s*\d+\b",  # "on page 4"
    re.IGNORECASE,
)


def normalise_ref(value: Any) -> Optional[str]:
    if isinstance(value, int):
        return f"C{value}"
    if not isinstance(value, str):
        return None
    m = _REF_TOKEN.match(value)
    return f"C{int(m.group(1))}" if m else None


def _normalise_text(s: str) -> str:
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace("­", "")
    s = re.sub(r"-\s*\n\s*", "", s)  # de-hyphenate line breaks
    s = re.sub(r"\s+", " ", s)
    return s.strip().lower()


def quote_in_text(quote: str, text: str) -> bool:
    q = _normalise_text(quote).strip(" .,;:\"'")
    if len(q) < MIN_QUOTE_CHARS:
        return False
    return q in _normalise_text(text)


_WORD = re.compile(r"[a-z0-9]{3,}")


def best_excerpt(text: str, hint: str) -> str:
    """Pick the passage sentence(s) that best overlap with `hint`. Always real chunk text."""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n{2,}", text) if s.strip()]
    if not sentences:
        return text[:MAX_EXCERPT_CHARS]
    hint_words = set(_WORD.findall(hint.lower()))
    best_i, best_score = 0, -1
    for i, sent in enumerate(sentences):
        score = len(hint_words & set(_WORD.findall(sent.lower())))
        if score > best_score:
            best_i, best_score = i, score
    excerpt = sentences[best_i]
    # Extend with following sentences while there is room, for context.
    j = best_i + 1
    while j < len(sentences) and len(excerpt) + len(sentences[j]) + 1 <= MAX_EXCERPT_CHARS:
        excerpt += " " + sentences[j]
        j += 1
    if len(excerpt) > MAX_EXCERPT_CHARS:
        excerpt = excerpt[:MAX_EXCERPT_CHARS].rsplit(" ", 1)[0] + "…"
    return excerpt


def strip_page_mentions(answer: str) -> str:
    """Remove page references the model wrote itself; pages come only from citations."""
    cleaned = _PAGE_MENTION.sub("", answer)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def validate_model_output(raw: Any, evidence: list[Evidence], hint: str = "") -> GroundedResult:
    """Validate model output against the evidence that was actually retrieved.

    `hint` (usually the question) helps choose an excerpt when the model's
    quote can't be verified.
    """
    if not evidence:
        return insufficient("no_evidence")

    data = parse_model_json(raw)
    if data is None:
        return insufficient("unparseable_output", UNVERIFIABLE_MESSAGE)

    if data.get("insufficient_evidence") is True:
        return insufficient("model_reported_insufficient")

    answer = data.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return insufficient("empty_answer")

    by_ref = {e.ref: e for e in evidence}
    rejected: list[str] = []

    # Quotes the model offered for each valid ref (first non-empty wins).
    quotes: dict[str, str] = {}
    listed_refs: list[str] = []
    raw_citations = data.get("citations")
    if isinstance(raw_citations, list):
        for item in raw_citations:
            if not isinstance(item, dict):
                continue
            ref = normalise_ref(item.get("ref"))
            if ref is None or ref not in by_ref:
                rejected.append(str(item.get("ref")))
                continue
            if ref not in listed_refs:
                listed_refs.append(ref)
            quote = item.get("quote")
            if isinstance(quote, str) and quote.strip() and ref not in quotes:
                quotes[ref] = quote.strip()

    # Renumber markers in order of first appearance; drop markers for unknown refs.
    ordinal_of: dict[str, int] = {}

    def _replace(match: re.Match) -> str:
        parts = re.split(r"\s*[,;]\s*", match.group(1))
        out = []
        for part in parts:
            ref = normalise_ref(part)
            if ref is None or ref not in by_ref:
                rejected.append(part.strip())
                continue
            if ref not in ordinal_of:
                ordinal_of[ref] = len(ordinal_of) + 1
            out.append(f"[{ordinal_of[ref]}]")
        return "".join(out)

    answer = _MARKER_GROUP.sub(_replace, answer)

    # Citations listed by the model but never marked in the text are still
    # valid support; append their markers so every citation is visible.
    trailing = [r for r in listed_refs if r not in ordinal_of]
    for ref in trailing:
        ordinal_of[ref] = len(ordinal_of) + 1
    if trailing:
        answer = answer.rstrip() + " " + "".join(f"[{ordinal_of[r]}]" for r in trailing)

    if not ordinal_of:
        # An answer with no verifiable support is not shown.
        return insufficient("no_valid_citations", rejected=rejected)

    answer = strip_page_mentions(answer)
    answer = re.sub(r"\s+([.,;:])", r"\1", answer)

    citations: list[VerifiedCitation] = []
    for ref, ordinal in sorted(ordinal_of.items(), key=lambda kv: kv[1]):
        ev = by_ref[ref]
        quote = quotes.get(ref)
        verified = bool(quote) and quote_in_text(quote, ev.text)
        excerpt = quote if verified else best_excerpt(ev.text, f"{quote or ''} {hint} {answer}")
        citations.append(VerifiedCitation(
            ordinal=ordinal,
            chunkId=ev.chunk_id,
            documentId=ev.document_id,
            title=ev.title,
            page=ev.page,
            excerpt=excerpt,
            quoteVerified=verified,
        ))

    return GroundedResult(status=ANSWERED, answer=answer, citations=citations, rejectedRefs=rejected)


def sample_evenly(items: list, k: int) -> list:
    """Pick up to k items spread across the list, preserving order."""
    if len(items) <= k:
        return list(items)
    step = len(items) / k
    return [items[int(i * step)] for i in range(k)]
