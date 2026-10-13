import React, { useState } from 'react';
import { UserPlus, Copy, RefreshCw, Download, Trash2, Key, Shield, Clock } from 'lucide-react';
import { PageHeader } from '../components/layout';
import { Button, Badge, DataTable, ConfirmModal, SkeletonTable } from '../components/ui';
import type { Column } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAdminUsers, useApiKeys } from '../hooks/useApi';
import type { AdminUser, ApiKey } from '../lib/mock-data';
import './AdminPage.css';

export const AdminPage: React.FC = () => {
    const toast = useToast();
    const users = useAdminUsers();
    const apiKeys = useApiKeys();
    const [retentionDays, setRetentionDays] = useState(90);
    const [deleteKeyModal, setDeleteKeyModal] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: '', name: '' });

    const userColumns: Column<AdminUser>[] = [
        {
            key: 'name', header: 'Name', render: (r) => (
                <div className="admin-user-cell">
                    <div className="admin-user-avatar">{r.name.split(' ').map(n => n[0]).join('')}</div>
                    <div>
                        <div className="admin-user-name">{r.name}</div>
                        <div className="admin-user-email">{r.email}</div>
                    </div>
                </div>
            )
        },
        {
            key: 'role', header: 'Role', width: '120px', render: (r) => {
                const v = r.role === 'admin' ? 'info' : r.role === 'member' ? 'success' : 'neutral';
                return <Badge variant={v}>{r.role.charAt(0).toUpperCase() + r.role.slice(1)}</Badge>;
            }
        },
        { key: 'lastActive', header: 'Last Active', width: '120px' },
    ];

    const keyColumns: Column<ApiKey>[] = [
        { key: 'name', header: 'Name', render: (r) => <span style={{ fontWeight: 500 }}>{r.name}</span> },
        { key: 'maskedKey', header: 'Key', render: (r) => <code className="masked-key">{r.maskedKey}</code> },
        { key: 'createdAt', header: 'Created', width: '110px' },
        { key: 'lastUsed', header: 'Last Used', width: '110px' },
        {
            key: 'actions', header: '', width: '100px', render: (r) => (
                <div className="row-actions">
                    <button className="row-action-btn" title="Copy" onClick={() => toast.addToast('API key copied to clipboard', 'success')}>
                        <Copy size={14} />
                    </button>
                    <button className="row-action-btn" title="Regenerate" onClick={() => toast.addToast('Key regenerated', 'info')}>
                        <RefreshCw size={14} />
                    </button>
                    <button className="row-action-btn row-action-danger" title="Delete" onClick={() => setDeleteKeyModal({ open: true, id: r.id, name: r.name })}>
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        },
    ];

    return (
        <div className="admin-page">
            <PageHeader title="Admin" subtitle="Manage users, API keys, and data policies" />

            {/* Roles */}
            <section className="admin-section">
                <div className="section-header">
                    <div className="section-header-text">
                        <Shield size={18} />
                        <h3>User Roles</h3>
                    </div>
                    <Button variant="secondary" size="sm" icon={<UserPlus size={14} />}>Invite Member</Button>
                </div>
                {users.isLoading ? <SkeletonTable rows={3} cols={3} /> : (
                    <DataTable columns={userColumns} data={users.data || []} keyField="id" />
                )}
            </section>

            {/* API Keys */}
            <section className="admin-section">
                <div className="section-header">
                    <div className="section-header-text">
                        <Key size={18} />
                        <h3>API Keys</h3>
                    </div>
                    <Button variant="secondary" size="sm" icon={<Key size={14} />}>Generate New Key</Button>
                </div>
                {apiKeys.isLoading ? <SkeletonTable rows={2} cols={5} /> : (
                    <DataTable columns={keyColumns} data={apiKeys.data || []} keyField="id" />
                )}
            </section>

            {/* Data Retention */}
            <section className="admin-section">
                <div className="section-header">
                    <div className="section-header-text">
                        <Clock size={18} />
                        <h3>Data Retention</h3>
                    </div>
                </div>
                <div className="retention-card">
                    <p className="retention-desc">Automatically delete indexed data and chat history after a set number of days.</p>
                    <div className="retention-control">
                        <label htmlFor="retention-slider" className="retention-label">
                            Delete after <strong>{retentionDays} days</strong>
                        </label>
                        <input
                            id="retention-slider"
                            type="range"
                            min={7}
                            max={365}
                            value={retentionDays}
                            onChange={e => setRetentionDays(Number(e.target.value))}
                            className="retention-slider"
                        />
                        <div className="retention-range">
                            <span>7 days</span>
                            <span>365 days</span>
                        </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => toast.addToast('Retention policy updated', 'success')}>Save Policy</Button>
                </div>
            </section>

            {/* Export */}
            <section className="admin-section">
                <Button variant="secondary" icon={<Download size={16} />} onClick={() => toast.addToast('Report export started', 'info')}>
                    Export Report
                </Button>
            </section>

            <ConfirmModal
                open={deleteKeyModal.open}
                onClose={() => setDeleteKeyModal({ open: false, id: '', name: '' })}
                onConfirm={() => { toast.addToast(`Deleted key "${deleteKeyModal.name}"`, 'success'); setDeleteKeyModal({ open: false, id: '', name: '' }); }}
                title="Delete API Key"
                message={`Are you sure you want to delete "${deleteKeyModal.name}"? This cannot be undone.`}
                confirmLabel="Delete Key"
                variant="danger"
            />
        </div>
    );
};
