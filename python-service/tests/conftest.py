"""
Shared fixtures for pytest.
"""
import pytest
import json
import os

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'testing', 'fixtures')


@pytest.fixture
def sample_notes_content():
    """Load the sample markdown notes fixture."""
    with open(os.path.join(FIXTURES_DIR, 'sample-notes.md')) as f:
        return f.read()


@pytest.fixture
def sample_chat_queries():
    """Load the sample chat queries fixture."""
    with open(os.path.join(FIXTURES_DIR, 'chat-queries.json')) as f:
        return json.load(f)
