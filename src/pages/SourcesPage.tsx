import React, { useRef, useState } from 'react';
import { FileText, RefreshCw, Trash2, Upload, PlugZap, AlertTriangle, FileType } from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Tabs, Button, Badge, DataTable, ConfirmModal, SkeletonTable, ProgressBar } from '../components/ui';
import type { Tab, Column } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import {
    useNoteSources, usePdfSources, useUploadPdf,
    useDeleteSource, useSyncNotes,
} from '../hooks/useApi';
import type { NoteSource, PdfSource } from '../lib/mock-data';
import { parseApiError } from '../lib/errors';
import './SourcesPage.css';

const sourceTabs: Tab[] = [
    { id: 'pdf', label: 'PDF', icon: <FileType size={16} /> },
    { id: 'notes', label: 'Notes', icon: <FileText size={16} /> },
];

export const SourcesPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('pdf');
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; id: string; title: string }>({ open: false, id: '', title: '' });
    const [errorBanner, setErrorBanner] = useState<string | null>(null);

    const toast = useToast();
    const pdfSources = usePdfSources();
    const noteSources = useNoteSources();
    const uploadPdfMutation = useUploadPdf();
    const deleteMutation = useDeleteSource();
    const syncMutation = useSyncNotes();
    const pdfFileInputRef = useRef<HTMLInputElement>(null);

    const handleDelete = async () => {
        try {
            await deleteMutation.mutateAsync(deleteModal.id);
            toast.addToast(`Deleted "${deleteModal.title}"`, 'success');
            setDeleteModal({ open: false, id: '', title: '' });
        } catch (e) {
            toast.addToast(parseApiError(e).message, 'error');
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
            <PageHeader title="Sources" subtitle="Manage your PDFs and notes" />

            {errorBanner && (
                <div className="error-banner" role="alert">
                    <AlertTriangle size={16} />
                    <span>{errorBanner}</span>
                    <button onClick={() => setErrorBanner(null)} className="error-banner-dismiss" aria-label="Dismiss">×</button>
                </div>
            )}

            <Tabs tabs={sourceTabs} activeTab={activeTab} onChange={setActiveTab}>
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
        </div>
    );
};
