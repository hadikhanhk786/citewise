"""
Citation validation for grounded answers. These are deterministic: the
"model output" is supplied directly, so no model or database is needed.
"""
import json

from app.services.grounded import (
    ANSWERED,
    INSUFFICIENT_EVIDENCE,
    INSUFFICIENT_MESSAGE,
    UNVERIFIABLE_MESSAGE,
    Evidence,
    build_answer_prompt,
    build_evidence,
    normalise_ref,
    parse_model_json,
    sample_evenly,
    validate_model_output,
)

EVIDENCE = [
    Evidence(ref="C1", chunk_id="chunk-a", document_id="doc-1", title="Annual Report.pdf", page=4,
             text="Revenue grew 12% year over year, driven by the consulting segment. Margins were flat."),
    Evidence(ref="C2", chunk_id="chunk-b", document_id="doc-2", title="Board Minutes.pdf", page=9,
             text="The board approved a new office in Dublin.\nHiring will begin in Q3."),
]


def out(answer, citations=None, insufficient=False):
    return json.dumps({"answer": answer, "citations": citations or [], "insufficient_evidence": insufficient})


class TestValidCitations:
    def test_page_and_document_come_from_retrieved_chunk(self):
        r = validate_model_output(out(
            "Revenue grew 12% [C1]. A Dublin office was approved [C2].",
            [{"ref": "C1", "quote": "Revenue grew 12% year over year"},
             {"ref": "C2", "quote": "The board approved a new office in Dublin."}],
        ), EVIDENCE)
        assert r.status == ANSWERED
        assert r.answer == "Revenue grew 12% [1]. A Dublin office was approved [2]."
        assert [(c.ordinal, c.documentId, c.chunkId, c.page) for c in r.citations] == [
            (1, "doc-1", "chunk-a", 4),
            (2, "doc-2", "chunk-b", 9),
        ]
        assert all(c.quoteVerified for c in r.citations)

    def test_ordinals_follow_first_appearance(self):
        r = validate_model_output(out("Dublin [C2]. Revenue [C1]. Dublin again [C2]."), EVIDENCE)
        assert r.answer == "Dublin [1]. Revenue [2]. Dublin again [1]."
        assert [c.chunkId for c in r.citations] == ["chunk-b", "chunk-a"]

    def test_combined_marker_groups(self):
        r = validate_model_output(out("Both facts hold [C1, C2]."), EVIDENCE)
        assert r.answer == "Both facts hold [1][2]."

    def test_ref_formats_are_normalised(self):
        assert normalise_ref("C3") == "C3"
        assert normalise_ref("[c3]") == "C3"
        assert normalise_ref("3") == "C3"
        assert normalise_ref(3) == "C3"
        assert normalise_ref("page 3") is None
        assert normalise_ref(None) is None

    def test_quote_verified_despite_whitespace_and_case(self):
        r = validate_model_output(out("Hiring starts in Q3 [C2].", [
            {"ref": "C2", "quote": "approved a NEW office in   Dublin. Hiring will begin"}
        ]), EVIDENCE)
        assert r.citations[0].quoteVerified is True

    def test_listed_but_unmarked_citation_is_appended(self):
        r = validate_model_output(out("Revenue grew.", [{"ref": "C1", "quote": "Revenue grew 12%"}]), EVIDENCE)
        assert r.status == ANSWERED
        assert r.answer == "Revenue grew. [1]"


class TestInvalidCitationsRejected:
    def test_nonexistent_ref_removed_from_answer(self):
        r = validate_model_output(out("Revenue grew [C1]. Profit tripled [C7].",
                                      [{"ref": "C7", "quote": "Profit tripled"}]), EVIDENCE)
        assert r.status == ANSWERED
        assert "[C7]" not in r.answer and "7" not in r.answer.replace("Revenue", "")
        assert [c.chunkId for c in r.citations] == ["chunk-a"]
        assert "C7" in r.rejectedRefs

    def test_only_invalid_refs_means_insufficient(self):
        r = validate_model_output(out("Profit tripled [C9].", [{"ref": "C9", "quote": "x"}]), EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE
        assert r.answer == INSUFFICIENT_MESSAGE
        assert r.citations == []

    def test_uncited_answer_is_not_shown(self):
        r = validate_model_output(out("Profit tripled thanks to AI."), EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE
        assert "tripled" not in r.answer

    def test_fabricated_quote_is_replaced_by_real_excerpt(self):
        r = validate_model_output(out("Revenue grew [C1].", [
            {"ref": "C1", "quote": "Revenue grew 45% thanks to a merger"}
        ]), EVIDENCE, hint="How much did revenue grow?")
        c = r.citations[0]
        assert c.quoteVerified is False
        assert "45%" not in c.excerpt
        assert c.excerpt in EVIDENCE[0].text  # excerpt is always real source text

    def test_short_quote_not_trusted(self):
        r = validate_model_output(out("Margins [C1].", [{"ref": "C1", "quote": "flat"}]), EVIDENCE)
        assert r.citations[0].quoteVerified is False

    def test_model_written_page_numbers_are_stripped(self):
        r = validate_model_output(out("Revenue grew 12% (page 99) [C1]. See page 42 for more [C1]."), EVIDENCE)
        assert "99" not in r.answer and "42" not in r.answer
        assert r.citations[0].page == 4

    def test_non_dict_citation_entries_ignored(self):
        r = validate_model_output(json.dumps({"answer": "Revenue [C1].", "citations": ["C1", 5, None]}), EVIDENCE)
        assert r.status == ANSWERED and len(r.citations) == 1


class TestInsufficientEvidence:
    def test_model_reports_insufficient(self):
        r = validate_model_output(out("", insufficient=True), EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE
        assert r.answer == INSUFFICIENT_MESSAGE
        assert r.reason == "model_reported_insufficient"

    def test_insufficient_flag_wins_over_answer(self):
        r = validate_model_output(out("Maybe revenue grew [C1].", insufficient=True), EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE

    def test_no_evidence(self):
        r = validate_model_output(out("Revenue grew [C1]."), [])
        assert r.status == INSUFFICIENT_EVIDENCE
        assert r.reason == "no_evidence"

    def test_unparseable_output(self):
        r = validate_model_output("Sure! Revenue grew 12% according to page 4.", EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE
        assert r.answer == UNVERIFIABLE_MESSAGE

    def test_empty_answer(self):
        r = validate_model_output(out("   "), EVIDENCE)
        assert r.status == INSUFFICIENT_EVIDENCE


class TestHelpers:
    def test_parse_handles_fences_and_prose(self):
        assert parse_model_json('```json\n{"answer": "a"}\n```') == {"answer": "a"}
        assert parse_model_json('Here you go: {"answer": "b"} thanks') == {"answer": "b"}
        assert parse_model_json("[1, 2]") is None
        assert parse_model_json(None) is None

    def test_build_evidence_uses_stored_page_and_skips_pageless(self):
        class Row:
            def __init__(self, id, source_id, content, meta):
                self.id, self.source_id, self.content, self.metadata_ = id, source_id, content, meta
        ev = build_evidence([
            Row("a", "doc-1", "text a", {"page": 2, "title": "A.pdf"}),
            Row("b", "doc-1", "text b", {"title": "A.pdf"}),  # no page -> unusable for citations
            Row("c", "doc-2", "text c", {"page": 5, "title": "B.pdf"}),
        ])
        assert [(e.ref, e.chunk_id, e.page) for e in ev] == [("C1", "a", 2), ("C2", "c", 5)]

    def test_prompt_labels_evidence_without_page_numbers(self):
        system, user = build_answer_prompt("What grew?", EVIDENCE)
        assert "[C1]" in user and "[C2]" in user
        assert "page 4" not in user  # model never sees pages, so it can't misreport them
        assert "insufficient_evidence" in system

    def test_sample_evenly(self):
        assert sample_evenly(list(range(5)), 10) == [0, 1, 2, 3, 4]
        picked = sample_evenly(list(range(100)), 4)
        assert picked == [0, 25, 50, 75]
