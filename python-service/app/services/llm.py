from __future__ import annotations
import os
import json
import asyncio
import logging
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from ..schemas.rag import Citation, SummaryData
from ..config import settings
from ..errors import ErrorCode
from .ai_errors import to_app_exception

logger = logging.getLogger("uvicorn")

class LLMService:
    def __init__(self):
        # CHAT_PROVIDER overrides LLM_PROVIDER for chat/summarize, keeping embedding separate
        self.provider = os.getenv("CHAT_PROVIDER", os.getenv("LLM_PROVIDER", "openai")).lower()
        self.api_key = os.getenv(f"{self.provider.upper()}_API_KEY")
        self.model_name = os.getenv(f"{self.provider.upper()}_CHAT_MODEL")
        
        if self.provider == "openai":
            self.llm = ChatOpenAI(
                model=self.model_name or "gpt-3.5-turbo",
                api_key=self.api_key,
                temperature=0.3
            )
        elif self.provider == "gemini":
            self.llm = ChatGoogleGenerativeAI(
                model=self.model_name or "gemini-pro",
                google_api_key=self.api_key,
                temperature=0.3
            )
        elif self.provider == "ollama":
            from langchain_ollama import ChatOllama
            self.model_name = self.model_name or "llama3.2"
            self.llm = ChatOllama(
                model=self.model_name,
                base_url=settings.OLLAMA_BASE_URL,
                temperature=0.3,
            )
        else:
            raise ValueError("Unsupported Provider")

    async def generate_response(self, query: str, context_chunks: list[dict], strict_sources: bool) -> tuple[str, list[Citation]]:
        if not context_chunks and strict_sources:
             return "I couldn't find any relevant information in your sources to answer this question. Please try adding more sources or rephrasing.", []

        # Prepare context string with rich source metadata
        context_str = ""
        citations = []

        for i, chunk in enumerate(context_chunks):
            meta = chunk.metadata_ or {}
            source_type = chunk.source_type
            title = meta.get('title', 'Unknown Source')
            snippet = chunk.content[:150] + "..."
            ref_num = i + 1

            # Build a rich source label so the LLM knows what kind of source this is
            if source_type == 'YOUTUBE':
                start = meta.get('start')
                end = meta.get('end')
                if start is not None:
                    ts_label = f"[{self._format_ts_display(start)} – {self._format_ts_display(end)}]"
                else:
                    ts_label = ""
                context_str += (
                    f"[Source {ref_num}] (YouTube video: \"{title}\" {ts_label})\n"
                    f"{chunk.content}\n\n"
                )
            elif source_type == 'PDF':
                page = meta.get('page')
                heading = meta.get('heading', '')
                page_label = f"page {page}" if page is not None else ""
                heading_label = f", section \"{heading}\"" if heading else ""
                context_str += (
                    f"[Source {ref_num}] (PDF: \"{title}\"{', ' + page_label if page_label else ''}{heading_label})\n"
                    f"{chunk.content}\n\n"
                )
            else:
                context_str += f"[Source {ref_num}] ({title})\n{chunk.content}\n\n"

            citations.append(Citation(
                sourceType=source_type,
                title=title,
                sourceId=chunk.source_id,
                docId=chunk.doc_id,
                timestampStart=self._format_timestamp(meta.get('start')),
                timestampEnd=self._format_timestamp(meta.get('end')),
                page=meta.get('page'),
                heading=meta.get('heading'),
                snippet=snippet
            ))

        if strict_sources:
            system_prompt = """You are 'My Learning Copilot', an expert learning assistant.

Your task is to answer the user's question using ONLY the provided sources.

**Response rules:**
- Use markdown formatting: headers (##), bullet points, bold for key terms, code blocks where relevant.
- Structure your answer clearly — start with a direct answer, then elaborate.
- For YouTube sources: reference them as "In the video \"<title>\" at <timestamp>" when citing.
- For PDF sources: reference them as "According to \"<title>\" (page X)" when citing.
- If the sources do not contain enough information, say exactly: "I don't have enough information in your sources to answer that."
- Do NOT use prior knowledge. Do NOT speculate beyond the sources.
"""
        else:
            system_prompt = """You are 'My Learning Copilot', an expert learning assistant.

Your task is to answer the user's question, preferring the provided sources but using your knowledge to fill gaps.

**Response rules:**
- Use markdown formatting: headers (##), bullet points, bold for key terms, code blocks where relevant.
- Structure your answer clearly — start with a direct answer, then elaborate with detail.
- For YouTube sources: reference them as "In the video \"<title>\" at <timestamp>" when citing.
- For PDF sources: reference them as "According to \"<title>\" (page X)" when citing.
- If a topic isn't covered by the sources, clearly say so before supplementing with general knowledge.
- Do not make up facts or invent source content.
"""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Sources:\n{context_str}\nQuestion: {query}")
        ]

        response = await self.llm.ainvoke(messages)
        return response.content, citations

    async def generate_grounded_json(self, system_prompt: str, user_prompt: str) -> str:
        """Run an evidence-only prompt and return the raw (JSON) text.

        Uses Ollama's JSON mode, a context window large enough for the
        evidence, and a low temperature. Provider failures are mapped to
        canonical AppExceptions (OLLAMA_UNAVAILABLE, LLM_TIMEOUT, ...).
        """
        messages = [SystemMessage(content=system_prompt), HumanMessage(content=user_prompt)]
        if self.provider == "ollama":
            llm = self.llm.bind(
                format="json",
                options={"temperature": settings.GROUNDED_TEMPERATURE, "num_ctx": settings.OLLAMA_NUM_CTX},
            )
        else:
            llm = self.llm
        try:
            response = await asyncio.wait_for(llm.ainvoke(messages), timeout=settings.LLM_TIMEOUT_SECONDS)
        except Exception as e:
            raise to_app_exception(e, default_code=ErrorCode.LLM_FAILED, model=self.model_name) from e
        content = response.content
        return content if isinstance(content, str) else json.dumps(content)

    async def generate_summary(self, chunks: list[dict]) -> SummaryData:
        context_parts = []
        for chunk in chunks:
            meta = chunk.get("metadata", {})
            start = meta.get("start")
            end = meta.get("end")
            ts = ""
            if start is not None:
                ts = f"[{self._format_ts_display(start)} - {self._format_ts_display(end)}] "
            context_parts.append(f"{ts}{chunk['content']}")

        context_str = "\n\n".join(context_parts)

        system_prompt = """You are a helpful assistant. Summarize the transcript and return JSON only.

Return this exact JSON structure with no extra text:
{
  "overview": "2-3 sentence summary here",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "snapshotMoments": [
    {"timestamp": 12.5, "label": "Short description of what happens at this moment"},
    {"timestamp": 45.0, "label": "Another important moment"}
  ]
}

Rules:
- overview: 2-3 sentences describing the main topic.
- keyPoints: exactly 5 strings, each a key idea from the transcript.
- snapshotMoments: 3 to 5 objects. Each must have:
    - timestamp: a number (seconds) from the timestamps shown in the transcript (e.g. [01:23 - 01:45] means timestamp 83).
    - label: a short phrase (max 8 words) describing what is visually happening or being explained at that moment.
  Pick moments that represent important transitions, key explanations, or visually rich content.
  Use the EXACT numeric second value from the transcript timestamps. Do not invent timestamps.
- Output valid JSON only. No markdown, no explanation."""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Transcript:\n{context_str[:4000]}")
        ]

        llm = self.llm.bind(format="json") if self.provider == "ollama" else self.llm
        response = await llm.ainvoke(messages)
        raw = response.content.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("LLM returned non-JSON summary, attempting recovery", extra={
                "raw_response_length": len(raw),
            })
            data = {
                "overview": raw[:500],
                "keyPoints": ["Summary generation produced unstructured output. Please retry."],
            }

        if not data.get("overview") and not data.get("keyPoints"):
            logger.error("LLM returned empty summary JSON", extra={"raw": raw[:200]})
            raise ValueError("LLM returned an empty summary. The transcript may be too long for this model.")

        return SummaryData(
            overview=data.get("overview", ""),
            keyPoints=data.get("keyPoints", []),
            chapters=data.get("chapters"),
            snapshotMoments=data.get("snapshotMoments") or [],
        )

    def _format_ts_display(self, seconds: float | None) -> str:
        if seconds is None:
            return "00:00"
        mins, secs = divmod(int(seconds), 60)
        return f"{mins:02d}:{secs:02d}"

    def _format_timestamp(self, seconds: float | None) -> str | None:
        if seconds is None: return None
        return str(int(seconds))
