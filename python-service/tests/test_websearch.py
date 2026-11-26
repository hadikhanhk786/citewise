"""Web search turns SearXNG results into chunk-like sources and fails soft."""
import json
from unittest.mock import patch

from app.services import websearch

PAGE = b"""<html><head><title>Node 22 release</title><script>ignore()</script></head>
<body><nav>menu menu</nav><p>Node.js 22 adds require(esm) support behind a flag and a stable WebSocket client.</p>
<p>Unrelated paragraph about cooking pasta for a long time with lots of water.</p></body></html>"""


def fake_get(url, timeout):
    if "/search?" in url:
        return json.dumps({"results": [{"url": "https://nodejs.org/en/blog/22", "title": "Node.js 22", "content": "snippet"}]}).encode()
    return PAGE


def test_results_become_web_sources_with_relevant_text():
    with patch.object(websearch, "_get", side_effect=fake_get):
        pages = websearch.web_search("what is new in node 22 websocket")
    assert len(pages) == 1
    p = pages[0]
    assert p.source_type == "WEB" and p.metadata_["url"] == "https://nodejs.org/en/blog/22"
    assert "WebSocket client" in p.content
    assert "ignore()" not in p.content and "menu" not in p.content


def test_search_outage_returns_nothing():
    with patch.object(websearch, "_get", side_effect=OSError("down")):
        assert websearch.web_search("anything") == []
