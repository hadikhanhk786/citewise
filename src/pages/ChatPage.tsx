import React, { useState, useRef, useEffect, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Search, Plus, Send, Paperclip, ChevronDown, ChevronRight,
    FileText, ToggleLeft, ToggleRight, MessageSquare, FileType, Hash, Filter, X, Download
} from 'lucide-react';
import { Badge, Button, Skeleton } from '../components/ui';
import { useChatSessions, useChatMessages, useSendMessage, useCreateChatSession, usePdfSources } from '../hooks/useApi';
import type { Citation } from '../lib/mock-data';
import { useToast } from '../components/ui/Toast';
import { parseApiError } from '../lib/errors';
import { ChatChart } from '../components/ChatChart';
import { printAnswer } from '../lib/printAnswer';
import './ChatPage.css';

// Answers may contain a ```chart block; draw it instead of showing the JSON.
const markdownComponents = {
    pre: ({ children, ...props }: React.ComponentProps<'pre'>) => {
        if (isValidElement<{ className?: string; children?: React.ReactNode }>(children) && children.props.className === 'language-chart') {
            return <ChatChart source={String(children.props.children)} />;
        }
        return <pre {...props}>{children}</pre>;
    },
};

export const ChatPage: React.FC = () => {
    const [selectedSession, setSelectedSession] = useState<string | null>(null);
    const [isNewChat, setIsNewChat] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [inputText, setInputText] = useState('');
    const [mode, setMode] = useState<'hybrid' | 'pdf'>('hybrid');
    const [strictSource, setStrictSource] = useState(false);
    const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
    const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
    const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
    const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
    const [pendingText, setPendingText] = useState<string | null>(null);
    const [waitSeconds, setWaitSeconds] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const answerRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const sourcePickerRef = useRef<HTMLDivElement>(null);

    const toast = useToast();
    const sessions = useChatSessions();
    const messages = useChatMessages(selectedSession);
    const sendMutation = useSendMessage();
    const createSession = useCreateChatSession();
    const pdfSources = usePdfSources();

    // Close source picker when clicking outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (sourcePickerRef.current && !sourcePickerRef.current.contains(e.target as Node)) {
                setSourcePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.data, pendingText]);

    // Count seconds while waiting so a slow local model doesn't look frozen.
    useEffect(() => {
        if (pendingText === null) return;
        const timer = setInterval(() => setWaitSeconds(s => s + 1), 1000);
        return () => clearInterval(timer);
    }, [pendingText]);

    useEffect(() => {
        if (sessions.data && sessions.data.length > 0 && !selectedSession && !isNewChat) {
            setSelectedSession(sessions.data[0].id);
        }
    }, [sessions.data, isNewChat]);

    const handleSend = async () => {
        if (!inputText.trim()) return;
        const text = inputText;
        setInputText('');
        setPendingText(text);
        setWaitSeconds(0);

        let sessionId = selectedSession;
        if (!sessionId) {
            try {
                const title = text.trim().slice(0, 60);
                const newSession = await createSession.mutateAsync(title);
                sessionId = newSession.id;
                setSelectedSession(sessionId);
                setIsNewChat(false);
            } catch (error) {
                console.error('Failed to create session', error);
                setPendingText(null);
                return;
            }
        }

        if (sessionId) {
            try {
                await sendMutation.mutateAsync({
                    sessionId,
                    message: text,
                    mode,
                    strictSources: strictSource,
                    sourceIds: selectedSourceIds.length > 0 ? selectedSourceIds : undefined,
                });
            } catch (e) {
                toast.addToast(parseApiError(e).message, 'error');
            }
        }
        setPendingText(null);
    };

    const handleNewChat = () => {
        setSelectedSession(null);
        setIsNewChat(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const toggleCitation = (msgId: string) => {
        setExpandedCitations(prev => {
            const next = new Set(prev);
            next.has(msgId) ? next.delete(msgId) : next.add(msgId);
            return next;
        });
    };

    const toggleSourceId = (id: string) => {
        setSelectedSourceIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const readySources = [
        ...(pdfSources.data || []).filter(s => s.status === 'ready').map(s => ({ id: s.id, title: s.title, type: 'pdf' as const })),
    ];

    const filteredSessions = (sessions.data || []).filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="chat-page">
            {/* Left: Sessions */}
            <div className="chat-sessions">
                <div className="sessions-header">
                    <h2 className="sessions-title">Chats</h2>
                    <button className="new-chat-btn" aria-label="New chat" onClick={handleNewChat}><Plus size={16} /></button>
                </div>
                <div className="sessions-search">
                    <Search size={14} className="sessions-search-icon" />
                    <input
                        className="sessions-search-input"
                        placeholder="Search chats…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="sessions-list">
                    {sessions.isLoading ? (
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Skeleton count={5} height="48px" />
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <div className="sessions-empty">
                            <MessageSquare size={24} />
                            <p>No chats yet</p>
                        </div>
                    ) : (
                        filteredSessions.map(s => (
                            <button
                                key={s.id}
                                className={`session-item ${selectedSession === s.id ? 'session-active' : ''}`}
                                onClick={() => { setSelectedSession(s.id); setActiveCitation(null); }}
                            >
                                <span className="session-item-title">{s.title}</span>
                                <span className="session-item-meta">{s.updatedAt} · {s.messageCount} msgs</span>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Center: Thread */}
            <div className="chat-thread">
                <div className="thread-header">
                    <div className="mode-selector">
                        {(['pdf', 'hybrid'] as const).map(m => (
                            <button
                                key={m}
                                className={`mode-btn ${mode === m ? 'mode-active' : ''}`}
                                onClick={() => setMode(m)}
                            >
                                {m === 'pdf' && <FileType size={14} />}
                                {m === 'hybrid' && <span style={{ fontSize: 12 }}>⚡</span>}
                                {m === 'pdf' ? 'PDF' : m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                        ))}
                    </div>
                    <div className="source-picker-wrapper" ref={sourcePickerRef}>
                        <button
                            className={`source-picker-btn ${selectedSourceIds.length > 0 ? 'source-picker-active' : ''}`}
                            onClick={() => setSourcePickerOpen(o => !o)}
                            title="Filter by specific sources"
                        >
                            <Filter size={14} />
                            <span>Sources{selectedSourceIds.length > 0 ? ` (${selectedSourceIds.length})` : ''}</span>
                            <ChevronDown size={12} />
                        </button>
                        {sourcePickerOpen && (
                            <div className="source-picker-dropdown">
                                <div className="source-picker-header">
                                    <span>Filter by source</span>
                                    {selectedSourceIds.length > 0 && (
                                        <button className="source-picker-clear" onClick={() => setSelectedSourceIds([])}>
                                            Clear all
                                        </button>
                                    )}
                                </div>
                                {readySources.length === 0 ? (
                                    <div className="source-picker-empty">No indexed sources yet</div>
                                ) : (
                                    readySources.map(src => (
                                        <label key={src.id} className="source-picker-item">
                                            <input
                                                type="checkbox"
                                                checked={selectedSourceIds.includes(src.id)}
                                                onChange={() => toggleSourceId(src.id)}
                                            />
                                            <FileType size={12} />
                                            <span className="source-picker-title">{src.title}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        className="strict-toggle"
                        onClick={() => setStrictSource(!strictSource)}
                        aria-pressed={strictSource}
                        title="Answer strictly from sources"
                    >
                        {strictSource ? <ToggleRight size={20} className="toggle-on" /> : <ToggleLeft size={20} />}
                        <span>Strict sources</span>
                    </button>
                </div>
                {selectedSourceIds.length > 0 && (
                    <div className="source-filter-chips">
                        {selectedSourceIds.map(id => {
                            const src = readySources.find(s => s.id === id);
                            if (!src) return null;
                            return (
                                <span key={id} className="source-filter-chip">
                                    <FileType size={11} />
                                    <span>{src.title}</span>
                                    <button onClick={() => toggleSourceId(id)} aria-label="Remove"><X size={11} /></button>
                                </span>
                            );
                        })}
                    </div>
                )}

                <div className="thread-messages">
                    {messages.isLoading ? (
                        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <Skeleton count={3} height="80px" />
                        </div>
                    ) : (
                        (messages.data || []).map((msg, i, all) => (
                            <div key={msg.id} className={`message message-${msg.role}`}>
                                <div className="message-avatar">
                                    {msg.role === 'user' ? 'AK' : 'AI'}
                                </div>
                                <div className="message-body">
                                    <div className="message-content" ref={el => { answerRefs.current[msg.id] = el; }}>
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                {msg.content}
                                            </ReactMarkdown>
                                        ) : (
                                            msg.content
                                        )}
                                    </div>
                                    <span className="message-time">{msg.timestamp}</span>
                                    {msg.role === 'assistant' && (
                                        <button
                                            className="citations-toggle"
                                            onClick={() => {
                                                const el = answerRefs.current[msg.id];
                                                const question = all[i - 1]?.role === 'user' ? all[i - 1].content : undefined;
                                                if (el && !printAnswer(question, el, msg.citations || [])) {
                                                    toast.addToast('Allow pop-ups to download the PDF', 'error');
                                                }
                                            }}
                                        >
                                            <Download size={14} /> PDF
                                        </button>
                                    )}
                                    {msg.citations && msg.citations.length > 0 && (
                                        <button
                                            className="citations-toggle"
                                            onClick={() => toggleCitation(msg.id)}
                                            aria-expanded={expandedCitations.has(msg.id)}
                                        >
                                            {expandedCitations.has(msg.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            {msg.citations.length} citation{msg.citations.length > 1 ? 's' : ''}
                                        </button>
                                    )}
                                    {msg.citations && expandedCitations.has(msg.id) && (
                                        <div className="inline-citations">
                                            {msg.citations.map((c, i) => (
                                                <button
                                                    key={i}
                                                    className={`citation-chip ${activeCitation === c ? 'citation-chip-active' : ''}`}
                                                    onClick={() => setActiveCitation(c)}
                                                >
                                                    {c.type === 'pdf' && <FileType size={12} />}
                                                    {c.type === 'note' && <FileText size={12} />}
                                                    <span>{c.title}</span>
                                                    {c.type === 'pdf' && c.page != null && (
                                                        <Badge variant="neutral" className="citation-time">
                                                            <Hash size={10} /> p.{c.page}
                                                        </Badge>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                    {pendingText !== null && (
                        <>
                            <div className="message message-user">
                                <div className="message-avatar">AK</div>
                                <div className="message-body">
                                    <div className="message-content">{pendingText}</div>
                                </div>
                            </div>
                            <div className="message message-assistant" aria-live="polite">
                                <div className="message-avatar">AI</div>
                                <div className="message-body">
                                    <div className="message-content message-thinking">
                                        Thinking<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                                        <span className="thinking-time">{waitSeconds}s</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="thread-input">
                    <button className="attach-btn" aria-label="Attach file"><Paperclip size={16} /></button>
                    <textarea
                        className="message-input"
                        placeholder="Ask a question…"
                        rows={1}
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <Button
                        size="sm"
                        onClick={handleSend}
                        loading={sendMutation.isPending}
                        icon={<Send size={14} />}
                        disabled={!inputText.trim()}
                    >
                        Send
                    </Button>
                </div>
            </div>

            {/* Right: Citations Panel */}
            <div className="citations-panel">
                <h3 className="panel-title">Citations & Preview</h3>
                {activeCitation ? (
                    <div className="citation-detail">
                        <div className="citation-detail-header">
                            {activeCitation.type === 'pdf' && (
                                <Badge variant="warning" dot><FileType size={12} /> PDF</Badge>
                            )}
                            {activeCitation.type === 'note' && (
                                <Badge variant="info" dot><FileText size={12} /> Note</Badge>
                            )}
                        </div>
                        <h4 className="citation-detail-title">{activeCitation.title}</h4>
                        {activeCitation.type === 'pdf' && activeCitation.page != null && (
                            <div className="citation-meta">
                                <Hash size={14} />
                                <span>Page {activeCitation.page}</span>
                            </div>
                        )}
                        {activeCitation.type === 'note' && activeCitation.heading && (
                            <div className="citation-meta">
                                <span>§ {activeCitation.heading}</span>
                                {activeCitation.updatedAt && <span className="citation-date">Updated {activeCitation.updatedAt}</span>}
                            </div>
                        )}
                        <div className="citation-preview">
                            <p className="citation-chunk">{activeCitation.chunkText}</p>
                        </div>
                    </div>
                ) : (
                    <div className="citation-empty">
                        <Search size={24} />
                        <p>Click a citation to preview</p>
                    </div>
                )}
            </div>
        </div>
    );
};
