import React, { useRef, useState } from 'react';
import { Youtube, FileText, Link2, RefreshCw, Trash2, Upload, PlugZap, AlertTriangle, BookOpen, CheckCircle, FileType } from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Tabs, Button, Input, Badge, DataTable, PipelineStepper, ConfirmModal, SkeletonTable, ProgressBar, Modal } from '../components/ui';
import type { Tab, Column } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import {
    useYouTubeSources, useNoteSources, usePdfSources,
    useIngestYouTube, useUploadPdf,
    useDeleteSource, useReindexSource, useSyncNotes, useSummarizeSource,
} from '../hooks/useApi';
import type { SummaryResult, VideoSnapshot } from '../lib/api';
import type { YouTubeSource, NoteSource, PdfSource } from '../lib/mock-data';
import { parseApiError } from '../lib/errors';
import './SourcesPage.css';

const sourceTabs: Tab[] = [
    { id: 'youtube', label: 'YouTube', icon: <Youtube size={16} /> },
    { id: 'pdf', label: 'PDF', icon: <FileType size={16} /> },
    { id: 'notes', label: 'Notes', icon: <FileText size={16} /> },
];

export const SourcesPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('youtube');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: string; title: string }>({ open: false, id: '', title: '' });
    const [reindexModal, setReindexModal] = useState<{ open: boolean; id: string; title: string }>({ open: false, id: '', title: '' });
    const [errorBanner, setErrorBanner] = useState<string | null>(null);
    const [summaryModal, setSummaryModal] = useState<{ open: boolean; data: SummaryResult | null }>({ open: false, data: null });

    const toast = useToast();
    const ytSources = useYouTubeSources();
    const pdfSources = usePdfSources();
    const noteSources = useNoteSources();
    const ingestMutation = useIngestYouTube();
    const uploadPdfMutation = useUploadPdf();
    const deleteMutation = useDeleteSource();
    const reindexMutation = useReindexSource();
    const syncMutation = useSyncNotes();
    const summarizeMutation = useSummarizeSource();
    const pdfFileInputRef = useRef<HTMLInputElement>(null);

    const handleIngest = async () => {
        if (!youtubeUrl.trim()) return;
        try {
            setErrorBanner(null);
            await ingestMutation.mutateAsync(youtubeUrl);
            toast.addToast('Video queued for indexing', 'success');
            setYoutubeUrl('');
        } catch (e) {
            const err = parseApiError(e);
            setErrorBanner(`${err.message}${err.hint ? ` ${err.hint}` : ''}`);
            toast.addToast(err.message, 'error');
        }
    };

    const handleDelete = async () => {
        try {
            await deleteMutation.mutateAsync(deleteModal.id);
            toast.addToast(`Deleted "${deleteModal.title}"`, 'success');
            setDeleteModal({ open: false, id: '', title: '' });
        } catch (e) {
            toast.addToast(parseApiError(e).message, 'error');
        }
    };

    const handleReindex = async () => {
        try {
            await reindexMutation.mutateAsync(reindexModal.id);
            toast.addToast(`Re-indexing "${reindexModal.title}"`, 'success');
            setReindexModal({ open: false, id: '', title: '' });
        } catch (e) {
            toast.addToast(parseApiError(e).message, 'error');
        }
    };

    const handleSummarize = async (id: string) => {
        try {
            const result = await summarizeMutation.mutateAsync(id);
            setSummaryModal({ open: true, data: result });
        } catch {
            toast.addToast('Failed to generate summary', 'error');
        }
    };

    const handlePdfUpload = async (file: File) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            toast.addToast('Only .pdf files are supported here', 'error');
            return;
        }
        try {
            setErrorBanner(null);
            await uploadPdfMutation.mutateAsync(file);
            toast.addToast(`Uploaded "${file.name}"`, 'success');
        } catch (e) {
            const err = parseApiError(e);
            setErrorBanner(`${err.message}${err.hint ? ` ${err.hint}` : ''}`);
            toast.addToast(err.message, 'error');
        }
    };

    const handleSync = async () => {
        try {
            await syncMutation.mutateAsync();
            toast.addToast('Notes synced successfully', 'success');
        } catch {
            toast.addToast('Sync failed', 'error');
        }
    };

    const getPipelineSteps = (p: YouTubeSource['pipeline']) => [
        { label: 'Loaded', status: p.loaded ? 'completed' as const : 'pending' as const },
        { label: 'Chunked', status: p.chunked ? 'completed' as const : p.loaded ? 'active' as const : 'pending' as const },
        { label: 'Embedded', status: p.embedded ? 'completed' as const : p.chunked ? 'active' as const : 'pending' as const },
        { label: 'Indexed', status: p.indexed ? 'completed' as const : p.embedded ? 'active' as const : 'pending' as const },
    ];

    const handleRetry = async (id: string, title: string) => {
        try {
            await reindexMutation.mutateAsync(id);
            toast.addToast(`Retrying "${title}"`, 'success');
        } catch (e) {
            toast.addToast(parseApiError(e).message, 'error');
        }
    };

    const ytColumns: Column<YouTubeSource>[] = [
        {
            key: 'title', header: 'Title', render: (r) => (
                <div>
                    <span className="source-title">{r.title}</span>
                    {r.status === 'error' && r.errorReason && (
                        <div className="source-error-inline" role="alert">
                            <AlertTriangle size={12} /> {r.errorReason}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'addedAt', header: 'Added', width: '110px' },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (r) => <Badge variant={r.status === 'ready' ? 'success' : r.status === 'indexing' ? 'warning' : 'error'} dot>{r.status}</Badge>
        },
        {
            key: 'pipeline', header: 'Pipeline', width: '280px',
            render: (r) => <PipelineStepper steps={getPipelineSteps(r.pipeline)} />
        },
        {
            key: 'actions', header: 'Actions', width: '140px',
            render: (r) => (
                <div className="row-actions">
                    <button
                        className="row-action-btn"
                        aria-label="Summarize"
                        title={r.status === 'ready' ? 'Summarize' : 'Index video first'}
                        disabled={r.status !== 'ready' || summarizeMutation.isPending}
                        onClick={() => handleSummarize(r.id)}
                    >
                        <BookOpen size={14} />
                    </button>
                    {r.status === 'error' ? (
                        <button className="row-action-btn" aria-label="Retry" title="Retry" onClick={() => handleRetry(r.id, r.title)}><RefreshCw size={14} /></button>
                    ) : (
                        <button className="row-action-btn" aria-label="Re-index" title="Re-index" onClick={() => setReindexModal({ open: true, id: r.id, title: r.title })}><RefreshCw size={14} /></button>
                    )}
                    <button className="row-action-btn row-action-danger" aria-label="Delete" title="Delete" onClick={() => setDeleteModal({ open: true, id: r.id, title: r.title })}><Trash2 size={14} /></button>
                </div>
            ),
        },
    ];

    const pdfColumns: Column<PdfSource>[] = [
        {
            key: 'title', header: 'Title', render: (r) => (
                <div>
                    <span className="source-title">{r.title}</span>
                    {r.status === 'error' && r.errorReason && (
                        <div className="source-error-inline" role="alert">
                            <AlertTriangle size={12} /> {r.errorReason}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'pageCount', header: 'Pages', width: '80px', render: (r) => r.pageCount ?? '—' },
        { key: 'addedAt', header: 'Added', width: '110px' },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (r) => <Badge variant={r.status === 'ready' ? 'success' : r.status === 'indexing' ? 'warning' : 'error'} dot>{r.status}</Badge>
        },
        {
            key: 'actions', header: 'Actions', width: '90px',
            render: (r) => (
                <div className="row-actions">
                    <button className="row-action-btn row-action-danger" aria-label="Delete" title="Delete" onClick={() => setDeleteModal({ open: true, id: r.id, title: r.title })}><Trash2 size={14} /></button>
                </div>
            ),
        },
    ];

    const noteColumns: Column<NoteSource>[] = [
        { key: 'title', header: 'Title', render: (r) => <span className="source-title">{r.title}</span> },
        { key: 'folder', header: 'Folder', width: '120px' },
        { key: 'tag', header: 'Tag', width: '100px', render: (r) => <Badge variant="neutral">{r.tag}</Badge> },
        { key: 'updatedAt', header: 'Updated', width: '110px' },
        {
            key: 'status', header: 'Status', width: '100px',
            render: (r) => <Badge variant={r.status === 'synced' ? 'success' : r.status === 'indexing' ? 'warning' : 'error'} dot>{r.status}</Badge>
        },
    ];

    return (
        <div className="sources-page">
            <PageHeader title="Sources" subtitle="Manage your YouTube videos and notes" />

            {errorBanner && (
                <div className="error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{errorBanner}</span>
                    <button onClick={() => setErrorBanner(null)} className="error-banner-dismiss" aria-label="Dismiss">×</button>
                </div>
            )}

            <Tabs tabs={sourceTabs} activeTab={activeTab} onChange={setActiveTab}>
                {activeTab === 'youtube' && (
                    <div className="tab-panel">
                        <div className="source-input-row">
                            <Input
                                placeholder="Paste YouTube URL…"
                                value={youtubeUrl}
                                onChange={e => setYoutubeUrl(e.target.value)}
                                icon={<Link2 size={16} />}
                                aria-label="YouTube URL"
                            />
                            <Button onClick={handleIngest} loading={ingestMutation.isPending} icon={<Youtube size={16} />}>
                                Fetch Transcript
                            </Button>
                        </div>

                        {ytSources.isLoading ? (
                            <SkeletonTable rows={5} cols={5} />
                        ) : (
                            <DataTable
                                columns={ytColumns}
                                data={ytSources.data || []}
                                keyField="id"
                                emptyState={
                                    <div className="empty-state">
                                        <Youtube size={40} />
                                        <h3>No YouTube sources yet</h3>
                                        <p>Paste a YouTube URL above to get started</p>
                                    </div>
                                }
                            />
                        )}
                    </div>
                )}

                {activeTab === 'pdf' && (
                    <div className="tab-panel">
                        <div className="notes-top-row">
                            <div
                                className="upload-zone"
                                onClick={() => pdfFileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const f = e.dataTransfer.files?.[0];
                                    if (f) handlePdfUpload(f);
                                }}
                                role="button"
                                tabIndex={0}
                            >
                                <Upload size={24} />
                                <p>Drag & drop a PDF here, or <strong>click to upload</strong></p>
                                <span className="upload-hint">Only .pdf — up to 5 MB</span>
                                <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    ref={pdfFileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) handlePdfUpload(f);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        </div>

                        {uploadPdfMutation.isPending && (
                            <ProgressBar value={50} label="Uploading PDF…" size="sm" />
                        )}

                        {pdfSources.isLoading ? (
                            <SkeletonTable rows={4} cols={5} />
                        ) : (
                            <DataTable
                                columns={pdfColumns}
                                data={pdfSources.data || []}
                                keyField="id"
                                emptyState={
                                    <div className="empty-state">
                                        <FileType size={40} />
                                        <h3>No PDFs uploaded yet</h3>
                                        <p>Upload a PDF above to chat with it</p>
                                    </div>
                                }
                            />
                        )}
                    </div>
                )}

                {activeTab === 'notes' && (
                    <div className="tab-panel">
                        <div className="notes-top-row">
                            <div className="upload-zone">
                                <Upload size={24} />
                                <p>Drag & drop files here, or <strong>click to upload</strong></p>
                                <span className="upload-hint">Supports .md, .txt</span>
                            </div>
                            <button className="notion-connect">
                                <PlugZap size={18} />
                                Connect Notion
                            </button>
                        </div>

                        <div className="sync-row">
                            <Button variant="secondary" onClick={handleSync} loading={syncMutation.isPending} icon={<RefreshCw size={14} />} size="sm">
                                Sync Notes
                            </Button>
                            <span className="sync-timestamp">Last sync: 5 min ago</span>
                            <ProgressBar value={75} label="Indexing progress" size="sm" />
                        </div>

                        {noteSources.isLoading ? (
                            <SkeletonTable rows={4} cols={5} />
                        ) : (
                            <DataTable
                                columns={noteColumns}
                                data={noteSources.data || []}
                                keyField="id"
                                emptyState={
                                    <div className="empty-state">
                                        <FileText size={40} />
                                        <h3>No notes imported yet</h3>
                                        <p>Upload files or connect Notion to get started</p>
                                    </div>
                                }
                            />
                        )}
                    </div>
                )}
            </Tabs>

            <ConfirmModal
                open={deleteModal.open}
                onClose={() => setDeleteModal({ open: false, id: '', title: '' })}
                onConfirm={handleDelete}
                title="Delete Source"
                message={`Are you sure you want to delete "${deleteModal.title}"? This will remove all indexed data and cannot be undone.`}
                confirmLabel="Delete"
                loading={deleteMutation.isPending}
                variant="danger"
            />

            <ConfirmModal
                open={reindexModal.open}
                onClose={() => setReindexModal({ open: false, id: '', title: '' })}
                onConfirm={handleReindex}
                title="Re-index Source"
                message={`Re-index "${reindexModal.title}"? This will re-process all chunks and update embeddings.`}
                confirmLabel="Re-index"
                loading={reindexMutation.isPending}
            />

            <Modal
                open={summaryModal.open}
                onClose={() => setSummaryModal({ open: false, data: null })}
                title={summaryModal.data?.title ? `Summary: ${summaryModal.data.title}` : 'Video Summary'}
                size="lg"
            >
                {summaryModal.data && (
                    <div className="summary-modal-body">
                        {summaryModal.data.cached && (
                            <div className="summary-cached-badge">
                                <CheckCircle size={13} /> Cached result
                            </div>
                        )}
                        <section className="summary-section">
                            <h4 className="summary-section-title">Overview</h4>
                            <p className="summary-overview">{summaryModal.data.summary.overview}</p>
                        </section>
                        <section className="summary-section">
                            <h4 className="summary-section-title">Key Points</h4>
                            <ul className="summary-key-points">
                                {summaryModal.data.summary.keyPoints.map((point, i) => (
                                    <li key={i}>{point}</li>
                                ))}
                            </ul>
                        </section>
                        {summaryModal.data.snapshots && summaryModal.data.snapshots.length > 0 && (
                            <section className="summary-section">
                                <h4 className="summary-section-title">Key Moments</h4>
                                <div className="summary-snapshots">
                                    {summaryModal.data.snapshots.map((snap: VideoSnapshot, i: number) => (
                                        <div key={i} className="summary-snapshot-card">
                                            <div
                                                className="summary-snapshot-frame"
                                                style={{
                                                    backgroundImage: `url(${snap.spriteUrl})`,
                                                    backgroundPosition: `-${snap.x}px -${snap.y}px`,
                                                    backgroundRepeat: 'no-repeat',
                                                    backgroundSize: `${snap.frameWidth * (snap.x === 0 && snap.y === 0 && snap.frameWidth > 200 ? 1 : 1)}px auto`,
                                                    width: Math.min(snap.frameWidth, 200),
                                                    height: Math.round(Math.min(snap.frameWidth, 200) / snap.frameWidth * snap.frameHeight),
                                                }}
                                            />
                                            <div className="summary-snapshot-info">
                                                <Badge variant="neutral">{snap.timestampDisplay}</Badge>
                                                <span className="summary-snapshot-label">{snap.label}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                        {summaryModal.data.summary.chapters && summaryModal.data.summary.chapters.length > 0 && (
                            <section className="summary-section">
                                <h4 className="summary-section-title">Chapters</h4>
                                <div className="summary-chapters">
                                    {summaryModal.data.summary.chapters.map((ch, i) => (
                                        <div key={i} className="summary-chapter">
                                            <div className="summary-chapter-header">
                                                <span className="summary-chapter-title">{ch.title}</span>
                                                <Badge variant="neutral">{ch.timestampStart} – {ch.timestampEnd}</Badge>
                                            </div>
                                            <p className="summary-chapter-text">{ch.summary}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};
