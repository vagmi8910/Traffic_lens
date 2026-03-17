// JobHistory.js — Browse and reload previous analysis jobs
import React, { useState, useEffect } from 'react';
import { History, RefreshCw, ChevronRight, CheckCircle, Clock, XCircle, Loader } from 'lucide-react';
import { listJobs } from '../api';

const STATUS_CFG = {
    completed: { color: 'var(--green)', icon: CheckCircle, label: 'Completed' },
    processing: { color: 'var(--accent)', icon: Loader, label: 'Processing' },
    queued: { color: 'var(--yellow)', icon: Clock, label: 'Queued' },
    failed: { color: 'var(--red)', icon: XCircle, label: 'Failed' },
    uploaded: { color: 'var(--text3)', icon: Clock, label: 'Uploaded' },
};

export default function JobHistory({ currentJobId, onSelectJob }) {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchJobs = async () => {
        setLoading(true);
        setError('');
        try {
            const resp = await listJobs();
            setJobs(resp.data.jobs || []);
        } catch (e) {
            setError('Could not load job history.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchJobs(); }, [currentJobId]); // refresh when a new job completes

    const completedJobs = jobs.filter(j => j.status === 'completed');
    const otherJobs = jobs.filter(j => j.status !== 'completed');
    const sorted = [...completedJobs, ...otherJobs];

    return (
        <div className="card fade-in">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,212,255,0.2)' }}>
                    <History size={15} color="var(--accent)" />
                </div>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: '0.95rem', marginBottom: 2 }}>Job History</h2>
                    <p style={{ color: 'var(--text3)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                        {completedJobs.length} completed job{completedJobs.length !== 1 ? 's' : ''} available
                    </p>
                </div>
                <button
                    onClick={fetchJobs}
                    disabled={loading}
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: '0.7rem' }}
                >
                    <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Refresh
                </button>
            </div>

            {/* Error */}
            {error && (
                <div className="alert alert-danger" style={{ marginBottom: 14 }}>
                    <span>{error}</span>
                </div>
            )}

            {/* Empty state */}
            {!loading && sorted.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: '0.82rem' }}>
                    <History size={32} style={{ marginBottom: 10, opacity: 0.3 }} />
                    <div>No jobs yet. Upload and analyse a video to get started.</div>
                </div>
            )}

            {/* Job list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map(job => {
                    const cfg = STATUS_CFG[job.status] || STATUS_CFG.uploaded;
                    const Icon = cfg.icon;
                    const isCurrent = job.job_id === currentJobId;
                    const canLoad = job.status === 'completed';

                    return (
                        <div
                            key={job.job_id}
                            onClick={() => canLoad && onSelectJob(job.job_id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '12px 14px',
                                borderRadius: 'var(--radius)',
                                border: `1px solid ${isCurrent ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`,
                                background: isCurrent ? 'rgba(0,212,255,0.06)' : 'var(--bg3)',
                                cursor: canLoad ? 'pointer' : 'default',
                                transition: 'all 0.15s',
                                opacity: job.status === 'failed' ? 0.6 : 1,
                            }}
                            onMouseEnter={e => { if (canLoad && !isCurrent) e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)'; }}
                            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                            {/* Status icon */}
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${cfg.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon size={15} color={cfg.color} style={{ animation: job.status === 'processing' ? 'spin 1s linear infinite' : 'none' }} />
                            </div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                        {job.filename || 'Unknown file'}
                                    </span>
                                    {isCurrent && (
                                        <span style={{ fontSize: '0.6rem', fontFamily: 'var(--font-mono)', background: 'rgba(0,212,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>
                                            ACTIVE
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    {/* Status */}
                                    <span style={{ fontSize: '0.68rem', color: cfg.color, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                                        {cfg.label}
                                    </span>
                                    {/* Job ID */}
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                                        #{job.job_id}
                                    </span>
                                    {/* Stats — only for completed */}
                                    {job.status === 'completed' && (
                                        <>
                                            {job.total_vehicles > 0 && (
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                                                    {job.total_vehicles} vehicles
                                                </span>
                                            )}
                                            {job.congestion && job.congestion !== 'N/A' && (
                                                <span style={{
                                                    fontSize: '0.62rem', fontFamily: 'var(--font-mono)', borderRadius: 3, padding: '1px 6px',
                                                    background: job.congestion === 'HIGH' ? 'rgba(255,59,92,0.15)' : job.congestion === 'MEDIUM' ? 'rgba(255,200,0,0.15)' : 'rgba(0,255,136,0.15)',
                                                    color: job.congestion === 'HIGH' ? 'var(--red)' : job.congestion === 'MEDIUM' ? 'var(--yellow)' : 'var(--green)',
                                                    border: `1px solid ${job.congestion === 'HIGH' ? 'rgba(255,59,92,0.3)' : job.congestion === 'MEDIUM' ? 'rgba(255,200,0,0.3)' : 'rgba(0,255,136,0.3)'}`,
                                                }}>
                                                    {job.congestion}
                                                </span>
                                            )}
                                            {job.processing_time_s > 0 && (
                                                <span style={{ fontSize: '0.65rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
                                                    {Number(job.processing_time_s).toFixed(1)}s
                                                </span>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Arrow — only for completed non-active */}
                            {canLoad && !isCurrent && (
                                <ChevronRight size={15} color="var(--text3)" style={{ flexShrink: 0 }} />
                            )}
                        </div>
                    );
                })}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}