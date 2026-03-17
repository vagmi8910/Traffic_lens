// HeatmapView.js — Canvas-based heatmap with self-contained data fetching
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Layers, MapPin, RefreshCw, AlertCircle } from 'lucide-react';
import AIInsight from './AIInsight';
import { getTrafficDensityHeatmap, getParkingHotspotsHeatmap } from '../api';

// ── Canvas renderer ───────────────────────────────────────────────────────────

function drawHeatmap(canvas, points, width, height, colorMode = 'traffic') {
  if (!canvas || !points?.length) return;
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = '#0d1318';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1e2d3d';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  // Use actual frame dimensions from data if available, otherwise fall back to min/max
  const sorted = [...points].sort((a, b) => (a.intensity || 1) - (b.intensity || 1));

  sorted.forEach(pt => {
    // Points are already in pixel space (from video frame), scale to canvas
    const cx = (pt.x / (canvas._frameW || width)) * width;
    const cy = (pt.y / (canvas._frameH || height)) * height;
    const intensity = Math.min(1, (pt.intensity || 1) / 10);
    const r = 18 + intensity * 28;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (colorMode === 'parking') {
      grad.addColorStop(0, `rgba(255, 59,  92, ${0.55 + intensity * 0.45})`);
      grad.addColorStop(0.4, `rgba(255, 140,  0, ${0.3 + intensity * 0.3})`);
      grad.addColorStop(1, 'rgba(255, 59, 92, 0)');
    } else {
      grad.addColorStop(0, `rgba(0, 212, 255, ${0.45 + intensity * 0.5})`);
      grad.addColorStop(0.4, `rgba(0, 255, 136, ${0.2 + intensity * 0.3})`);
      grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend({ mode }) {
  const stops = mode === 'parking'
    ? [{ c: '#00ff88', label: 'Low' }, { c: '#ffcc00', label: 'Medium' }, { c: '#ff3b5c', label: 'High' }]
    : [{ c: '#00d4ff', label: 'Low' }, { c: '#00ff88', label: 'Medium' }, { c: '#ff3b5c', label: 'Dense' }];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
      <span style={{ color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Density:</span>
      {stops.map(({ c, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} />
          <span style={{ color: 'var(--text2)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HeatmapView({ jobId }) {
  const trafficCanvasRef = useRef();
  const parkingCanvasRef = useRef();
  const wrapRef = useRef();

  const [tab, setTab] = useState('traffic');
  const [trafficData, setTrafficData] = useState(null);
  const [parkingData, setParkingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dims, setDims] = useState({ w: 800, h: 440 });

  // Measure container width
  useEffect(() => {
    if (!wrapRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      if (width > 0) setDims({ w: Math.floor(width), h: Math.floor(width * 0.52) });
    });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch both heatmaps when jobId changes
  const fetchHeatmaps = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError('');
    try {
      const [tr, pk] = await Promise.allSettled([
        getTrafficDensityHeatmap(jobId),
        getParkingHotspotsHeatmap(jobId),
      ]);

      if (tr.status === 'fulfilled' && tr.value?.data?.points?.length > 0) {
        setTrafficData(tr.value.data);
      } else {
        setTrafficData(null);
        const msg = tr.reason?.response?.data?.detail || '';
        if (msg) setError(msg);
      }

      if (pk.status === 'fulfilled' && pk.value?.data?.points?.length > 0) {
        setParkingData(pk.value.data);
      } else {
        setParkingData(null);
      }

    } catch (e) {
      setError('Failed to load heatmap data: ' + (e.message || e));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { fetchHeatmaps(); }, [fetchHeatmaps]);

  // Redraw traffic canvas whenever data or dims change
  useEffect(() => {
    if (!trafficData?.points?.length || !trafficCanvasRef.current) return;
    const c = trafficCanvasRef.current;
    c._frameW = trafficData.frame_width || dims.w;
    c._frameH = trafficData.frame_height || dims.h;
    drawHeatmap(c, trafficData.points, dims.w, dims.h, 'traffic');
  }, [trafficData, dims]);

  // Redraw parking canvas whenever data or dims change
  useEffect(() => {
    if (!parkingData?.points?.length || !parkingCanvasRef.current) return;
    const c = parkingCanvasRef.current;
    c._frameW = parkingData.frame_width || dims.w;
    c._frameH = parkingData.frame_height || dims.h;
    drawHeatmap(c, parkingData.points, dims.w, dims.h, 'parking');
  }, [parkingData, dims]);

  // Re-render visible canvas after tab switch
  useEffect(() => {
    setTimeout(() => {
      if (tab === 'traffic' && trafficData?.points?.length && trafficCanvasRef.current) {
        const c = trafficCanvasRef.current;
        c._frameW = trafficData.frame_width || dims.w;
        c._frameH = trafficData.frame_height || dims.h;
        drawHeatmap(c, trafficData.points, dims.w, dims.h, 'traffic');
      }
      if (tab === 'parking' && parkingData?.points?.length && parkingCanvasRef.current) {
        const c = parkingCanvasRef.current;
        c._frameW = parkingData.frame_width || dims.w;
        c._frameH = parkingData.frame_height || dims.h;
        drawHeatmap(c, parkingData.points, dims.w, dims.h, 'parking');
      }
    }, 50);
  }, [tab, trafficData, parkingData, dims]);

  const activeData = tab === 'traffic' ? trafficData : parkingData;
  const hasData = activeData?.points?.length > 0;

  return (
    <div className="card fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="section-label" style={{ marginBottom: 0, flex: 1 }}>
          <h3>{tab === 'traffic' ? 'Traffic Density Heatmap' : 'Parking Hotspot Heatmap'}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={fetchHeatmaps}
            disabled={loading}
            title="Reload heatmap data"
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg3)', padding: 4, borderRadius: 8, border: '1px solid var(--border)' }}>
            {[
              { id: 'traffic', icon: Layers, label: 'Traffic Density' },
              { id: 'parking', icon: MapPin, label: 'Parking Hotspots' },
            ].map(({ id, icon: Icon, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: tab === id ? (id === 'parking' ? 'var(--red)' : 'var(--accent)') : 'transparent',
                color: tab === id ? (id === 'parking' ? '#fff' : '#000') : 'var(--text2)',
                fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 0.15s',
              }}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Legend mode={tab} />

      {/* Canvas area */}
      <div ref={wrapRef} style={{ marginTop: 14, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative', minHeight: 240, background: '#0d1318' }}>

        {/* Loading spinner */}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#0d1318', zIndex: 2 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text3)' }}>Loading heatmap...</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && !hasData && (
          <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
            <AlertCircle size={32} color="var(--yellow)" opacity={0.7} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text)', textAlign: 'center' }}>
              Heatmap data not found for this job
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text3)', textAlign: 'center', maxWidth: 340, lineHeight: 1.7 }}>
              This job was processed before heatmap persistence was added.<br />
              Please re-process the video to generate heatmaps.
            </span>
            <button onClick={fetchHeatmaps} className="btn btn-ghost" style={{ marginTop: 4, fontSize: '0.72rem' }}>
              <RefreshCw size={12} /> Try again
            </button>
          </div>
        )}

        {/* No data (no error — e.g. zero vehicles detected) */}
        {!loading && !error && !hasData && (
          <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 10 }}>
            <Layers size={32} opacity={0.3} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
              {tab === 'traffic' ? 'No traffic density data' : 'No parking hotspots detected'}
            </span>
          </div>
        )}

        {/* Canvases — always rendered so refs are attached, hidden when inactive */}
        <canvas
          ref={trafficCanvasRef}
          style={{ display: (!loading && tab === 'traffic' && hasData) ? 'block' : 'none', width: '100%', height: 'auto' }}
        />
        <canvas
          ref={parkingCanvasRef}
          style={{ display: (!loading && tab === 'parking' && hasData) ? 'block' : 'none', width: '100%', height: 'auto' }}
        />
      </div>

      {/* Stats */}
      {hasData && (
        <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Estimated badge */}
          {activeData?.estimated && (
            <div style={{ background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 6, padding: '6px 12px', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠ Estimated — re-process video for exact heatmap
            </div>
          )}
          {tab === 'traffic' && trafficData && [
            { label: 'Total Points', value: trafficData.total_points ?? trafficData.points?.length ?? '—' },
            { label: 'Frames Analysed', value: trafficData.frames_analysed ?? '—' },
            { label: 'Peak Density', value: trafficData.peak_density != null ? Number(trafficData.peak_density).toFixed(2) : '—' },
            { label: 'Frame Size', value: trafficData.frame_width ? `${trafficData.frame_width}×${trafficData.frame_height}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 14px', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: '0.6rem' }}>{label}: </span>
              <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value}</span>
            </div>
          ))}
          {tab === 'parking' && parkingData && [
            { label: 'Hotspots', value: parkingData.total_hotspots ?? parkingData.points?.length ?? '—' },
            { label: 'High-Risk Zones', value: parkingData.high_risk_zones ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 14px', fontSize: '0.72rem' }}>
              <span style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: '0.6rem' }}>{label}: </span>
              <span style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Insight */}
      {hasData && (
        <AIInsight
          key={`heatmap-${tab}-${jobId}`}
          graphType={tab === 'traffic' ? 'heatmap_traffic' : 'heatmap_parking'}
          data={tab === 'traffic' ? {
            total_points: trafficData?.total_points ?? trafficData?.points?.length ?? 'N/A',
            frames_analysed: trafficData?.frames_analysed ?? 'N/A',
            peak_density: trafficData?.peak_density ?? 'N/A',
          } : {
            total_hotspots: parkingData?.total_hotspots ?? parkingData?.points?.length ?? 'N/A',
            high_risk_zones: parkingData?.high_risk_zones ?? 'N/A',
          }}
          jobId={jobId}
          autoLoad={true}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}