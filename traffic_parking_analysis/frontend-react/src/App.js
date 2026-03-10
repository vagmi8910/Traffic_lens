// App.js
import React, { useState, useEffect, useCallback } from 'react';
import VideoUpload from './components/VideoUpload';
import ProcessedVideoViewer from './components/ProcessedVideoViewer';
import TrafficStats from './components/TrafficStats';
import TrafficGraphs from './components/TrafficGraphs';
import HeatmapView from './components/HeatmapView';
import CongestionIndicator from './components/CongestionIndicator';
import ParkingAlerts from './components/ParkingAlerts';
import {
  getJobStatus, getTrafficMetrics, getCongestionLevel,
  getLaneBlockage, getParkingViolations, getTimeline,
  getTrafficDensityHeatmap, getParkingHotspotsHeatmap,
  healthCheck,
} from './api';

const POLL_MS = 4000;

function StatusBadge({ status }) {
  const cfg = {
    uploading: { color: 'var(--accent)', label: 'Uploading' },
    queued: { color: 'var(--yellow)', label: 'Queued' },
    processing: { color: 'var(--accent)', label: 'Processing' },
    completed: { color: 'var(--green)', label: 'Complete' },
    failed: { color: 'var(--red)', label: 'Failed' },
  }[status] || { color: 'var(--text3)', label: status };
  const pulse = ['processing', 'queued'].includes(status);
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: cfg.color, display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 8px ${cfg.color}`, animation: pulse ? 'pulse 1.5s infinite' : 'none' }} />
      {cfg.label}
    </span>
  );
}

function ProcessingOverlay({ jobId, status }) {
  if (!['queued', 'processing'].includes(status)) return null;
  return (
    <div className="card fade-in" style={{ textAlign: 'center', padding: '48px 20px' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', margin: '0 auto 20px', animation: 'spin 1s linear infinite' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text)', marginBottom: 8 }}>
        {status === 'queued' ? 'Queued for processing...' : 'Analysing video with YOLOv8...'}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>Job ID: <span style={{ color: 'var(--accent)' }}>{jobId}</span></div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text3)', marginTop: 6 }}>This may take a few minutes depending on video length</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  const [backendOk, setBackendOk] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');

  useEffect(() => {
    healthCheck().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
  }, []);

  const loadResults = useCallback(async id => {
    try {
      const [metrics, cong, lanes, viol, tl, heatTraffic, heatParking] = await Promise.allSettled([
        getTrafficMetrics(id),
        getCongestionLevel(id),
        getLaneBlockage(id),
        getParkingViolations(id),
        getTimeline(id),
        getTrafficDensityHeatmap(id),
        getParkingHotspotsHeatmap(id),
      ]);
      setResults({
        metrics: metrics.value?.data,
        congestion: cong.value?.data,
        laneBlockage: lanes.value?.data,
        violations: viol.value?.data,
        timeline: tl.value?.data?.timeline || [],
        heatTraffic: heatTraffic.value?.data,
        heatParking: heatParking.value?.data,
      });
    } catch (e) {
      console.error('Failed to load results', e);
    }
  }, []);

  useEffect(() => {
    if (!jobId || jobStatus === 'completed' || jobStatus === 'failed') return;
    const timer = setInterval(async () => {
      try {
        const resp = await getJobStatus(jobId);
        const s = resp.data.status;
        setJobStatus(s);
        if (s === 'completed') { clearInterval(timer); await loadResults(jobId); }
        else if (s === 'failed') clearInterval(timer);
      } catch { }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, jobStatus, loadResults]);

  const handleJobStarted = id => {
    setJobId(id);
    setJobStatus('queued');
    setResults(null);
    setActiveTab('dashboard');
  };

  const isProcessing = ['queued', 'processing'].includes(jobStatus);
  const isDone = jobStatus === 'completed';

  const tabs = [
    { id: 'upload', label: 'Upload' },
    { id: 'dashboard', label: 'Dashboard', disabled: !isDone },
    { id: 'charts', label: 'Charts', disabled: !isDone },
    { id: 'heatmap', label: 'Heatmap', disabled: !isDone },
    { id: 'video', label: 'Video', disabled: !isDone },
  ];

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Nav */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(8,12,16,0.93)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 28, borderRight: '1px solid var(--border)', marginRight: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#000', fontSize: '0.75rem' }}>TP</span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>TrafficLens</div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>AI Parking Analysis</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => !t.disabled && setActiveTab(t.id)} style={{
              padding: '18px 16px', border: 'none', background: 'transparent',
              cursor: t.disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: activeTab === t.id ? 'var(--accent)' : t.disabled ? 'var(--text3)' : 'var(--text2)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s', opacity: t.disabled ? 0.4 : 1,
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {backendOk !== null && (
            <div style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: backendOk ? 'var(--green)' : 'var(--red)' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: backendOk ? 'var(--green)' : 'var(--red)', display: 'inline-block', marginRight: 5 }} />
              API {backendOk ? 'ONLINE' : 'OFFLINE'}
            </div>
          )}
          {jobStatus && <StatusBadge status={jobStatus} />}
        </div>
      </nav>

      <main style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 20px' }}>

        {backendOk === false && (
          <div className="alert alert-danger" style={{ marginBottom: 20 }}>
            <span>⚠️ Backend offline. Run: <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,59,92,0.1)', padding: '2px 6px', borderRadius: 3 }}>uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload</code></span>
          </div>
        )}

        {/* ── Upload ── */}
        {activeTab === 'upload' && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ marginBottom: 8 }}>AI Traffic Parking Analysis</h1>
              <p style={{ color: 'var(--text2)', maxWidth: 520, margin: '0 auto', fontSize: '0.85rem' }}>
                Upload a traffic surveillance video to detect vehicles, identify roadside parking,
                and analyse congestion impact using YOLOv8 + SORT tracking.
              </p>
            </div>
            <VideoUpload onJobStarted={handleJobStarted} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 36, maxWidth: 900, margin: '36px auto 0' }}>
              {[
                { icon: '🔍', title: 'YOLOv8 Detection', desc: 'Detects cars, trucks, buses, bikes in real-time' },
                { icon: '🅿️', title: 'Parking Detection', desc: 'Identifies stationary vehicles via displacement tracking' },
                { icon: '🛣️', title: 'Lane Analysis', desc: 'Measures lane blockage caused by roadside parking' },
                { icon: '🔥', title: 'Heatmap Analysis', desc: 'Visualises traffic density and parking hotspots' },
                { icon: '📊', title: 'Traffic Metrics', desc: 'Density, speed, congestion classification per frame' },
                { icon: '🤖', title: 'AI Explanations', desc: 'LLaMA 3 explains every graph in plain language' },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="card" style={{ padding: '16px 18px' }}>
                  <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text3)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Dashboard: processing ── */}
        {activeTab === 'dashboard' && isProcessing && (
          <ProcessingOverlay jobId={jobId} status={jobStatus} />
        )}

        {/* ── Dashboard: results — NO video here ── */}
        {activeTab === 'dashboard' && isDone && results && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 285px', gap: 20, alignItems: 'start' }}>

            {/* Left column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <TrafficStats metrics={results.metrics} processing_time={results.metrics?.processing_time_s} />
              <ParkingAlerts violations={results.violations} />

              {/* Lane blockage cards */}
              {results.laneBlockage?.lanes && Object.keys(results.laneBlockage.lanes).length > 0 && (
                <div className="card fade-in">
                  <div className="section-label"><h3>Lane Blockage</h3></div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {Object.entries(results.laneBlockage.lanes).map(([id, info]) => {
                      const pct = info.avg_blockage_pct || 0;
                      const color = pct >= 50 ? 'var(--red)' : pct >= 20 ? 'var(--yellow)' : 'var(--green)';
                      return (
                        <div key={id} style={{ background: 'var(--bg3)', border: `1px solid ${color}30`, borderRadius: 8, padding: '12px 18px', minWidth: 110 }}>
                          <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 5 }}>Lane {id}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color }}>{pct}%</div>
                          <div style={{ fontSize: '0.65rem', color, fontFamily: 'var(--font-mono)', marginTop: 3 }}>{info.status}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <CongestionIndicator level={results.congestion?.congestion_level} description={results.congestion?.description} />
              <div className="card">
                <div className="section-label" style={{ marginBottom: 12 }}><h3>Summary</h3></div>
                {[
                  { label: 'Job ID', value: jobId },
                  { label: 'Frames', value: results.metrics?.total_frames_processed },
                  { label: 'Vehicles', value: results.metrics?.total_vehicles_seen },
                  { label: 'Violations', value: results.violations?.total_violations },
                  { label: 'Congestion', value: results.congestion?.congestion_level },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{label}</span>
                    <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{value ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Charts ── */}
        {activeTab === 'charts' && isDone && results && (
          <TrafficGraphs timeline={results.timeline} laneData={results.laneBlockage?.lanes} jobId={jobId} />
        )}

        {/* ── Heatmap ── */}
        {activeTab === 'heatmap' && isDone && results && (
          <HeatmapView trafficData={results.heatTraffic} parkingData={results.heatParking} jobId={jobId} />
        )}

        {/* ── Video — watch + download only here ── */}
        {activeTab === 'video' && isDone && (
          <ProcessedVideoViewer jobId={jobId} />
        )}

      </main>
    </div>
  );
}