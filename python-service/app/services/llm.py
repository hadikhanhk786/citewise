from __future__ import annotations
import os
import json
import asyncio
import logging
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage
from ..schemas.rag import Citation
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
            if source_type == 'PDF':
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
            system_prompt = """You are Citewise, a friendly study assistant. People upload PDFs and notes, and you answer
questions about them with page citations, summaries, tables and charts.

If the message is a greeting, small talk, thanks, or a question about you or what you can do
(e.g. "hi", "who are you?", "what can you do?"), reply briefly and warmly in the user's language,
say what you can help with, and suggest asking about their documents. Do not say you lack
information for these, and do not cite sources for them.

For questions about content, answer using ONLY the provided sources.

**Response rules:**
- Use markdown formatting: headers (##), bullet points, bold for key terms, code blocks where relevant.
- Structure your answer clearly — start with a direct answer, then elaborate.
- For PDF sources: reference them as "According to \"<title>\" (page X)" when citing.
- If the sources do not contain enough information, say exactly: "I don't have enough information in your sources to answer that."
- Do NOT use prior knowledge. Do NOT speculate beyond the sources.
- If the user asks for a chart, graph or plot, add ONE fenced code block whose language tag is exactly `chart` (not `json`), containing only JSON:
  {"type": "bar" | "line" | "pie", "title": "...", "data": [{"label": "...", "value": 12}]}
  Use 2-12 data points with numeric values, then explain the chart in text. Never invent numbers.
"""
        else:
            system_prompt = """You are Citewise, a friendly study assistant. People upload PDFs and notes, and you answer
questions about them with page citations, summaries, tables and charts.

If the message is a greeting, small talk, thanks, or a question about you or what you can do
(e.g. "hi", "who are you?", "what can you do?"), reply briefly and warmly in the user's language,
say what you can help with, and suggest asking about their documents. Do not say you lack
information for these, and do not cite sources for them.

For questions about content, prefer the provided sources and use your knowledge to fill gaps.

**Response rules:**
- Use markdown formatting: headers (##), bullet points, bold for key terms, code blocks where relevant.
- Structure your answer clearly — start with a direct answer, then elaborate with detail.
- For PDF sources: reference them as "According to \"<title>\" (page X)" when citing.
- If a topic isn't covered by the sources, clearly say so before supplementing with general knowledge.
- Do not make up facts or invent source content.
- If the user asks for a chart, graph or plot, add ONE fenced code block whose language tag is exactly `chart` (not `json`), containing only JSON:
  {"type": "bar" | "line" | "pie", "title": "...", "data": [{"label": "...", "value": 12}]}
  Use 2-12 data points with numeric values, then explain the chart in text. Never invent numbers.
"""

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Sources:\n{context_str or '(none matched this message)'}\nQuestion: {query}")
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

    def _format_ts_display(self, seconds: float | None) -> str:
        if seconds is None:
            return "00:00"
        mins, secs = divmod(int(seconds), 60)
        return f"{mins:02d}:{secs:02d}"

    def _format_timestamp(self, seconds: float | None) -> str | None:
        if seconds is None: return None
        return str(int(seconds))
