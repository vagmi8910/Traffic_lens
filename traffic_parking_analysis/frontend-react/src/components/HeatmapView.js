// HeatmapView.js — Canvas-based heatmap visualization with AI explanations
import React, { useEffect, useRef, useState } from 'react';
import { Layers, MapPin } from 'lucide-react';
import AIInsight from './AIInsight';

// ── Heatmap renderer on Canvas ──────────────────────────────────────────────

function drawHeatmap(canvas, points, width, height, colorMode = 'traffic') {
  if (!canvas || !points?.length) return;
  const ctx = canvas.getContext('2d');
  canvas.width  = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);

  // Background
  ctx.fillStyle = '#0d1318';
  ctx.fillRect(0, 0, width, height);

  // Draw grid lines
  ctx.strokeStyle = '#1e2d3d';
  ctx.lineWidth = 0.5;
  for (let x = 0; x < width; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke(); }
  for (let y = 0; y < height; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke(); }

  // Normalize coordinates to canvas
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const pad = 40;

  // Sort by intensity so brightest on top
  const sorted = [...points].sort((a, b) => (a.intensity || 1) - (b.intensity || 1));

  sorted.forEach(pt => {
    const cx = pad + ((pt.x - minX) / rangeX) * (width  - 2*pad);
    const cy = pad + ((pt.y - minY) / rangeY) * (height - 2*pad);
    const intensity = Math.min(1, (pt.intensity || 1) / 10);
    const r  = 18 + intensity * 24;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);

    if (colorMode === 'parking') {
      grad.addColorStop(0,   `rgba(255, 59,  92, ${0.5 + intensity * 0.5})`);
      grad.addColorStop(0.4, `rgba(255, 140,  0, ${0.3 + intensity * 0.3})`);
      grad.addColorStop(1,   'rgba(255, 59, 92, 0)');
    } else {
      grad.addColorStop(0,   `rgba(0, 212, 255, ${0.4 + intensity * 0.5})`);
      grad.addColorStop(0.4, `rgba(0, 255, 136, ${0.2 + intensity * 0.3})`);
      grad.addColorStop(1,   'rgba(0, 212, 255, 0)');
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

// ── Legend ──────────────────────────────────────────────────────────────────

function Legend({ mode }) {
  const stops = mode === 'parking'
    ? [{ c:'#00ff88', label:'Low' }, { c:'#ffcc00', label:'Medium' }, { c:'#ff3b5c', label:'High' }]
    : [{ c:'#00d4ff', label:'Low' }, { c:'#00ff88', label:'Medium' }, { c:'#ff3b5c', label:'Dense' }];
  return (
    <div style={{ display:'flex', alignItems:'center', gap:16, fontSize:'0.72rem', fontFamily:'var(--font-mono)' }}>
      <span style={{ color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Density:</span>
      {stops.map(({ c, label }) => (
        <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:10, height:10, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }} />
          <span style={{ color:'var(--text2)' }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function HeatmapView({ trafficData, parkingData, jobId }) {
  const trafficRef = useRef();
  const parkingRef = useRef();
  const [tab, setTab]       = useState('traffic');
  const [wrapRef, setWrapRef] = useState(null);
  const [dims, setDims]     = useState({ w: 600, h: 380 });

  // Measure container
  useEffect(() => {
    if (!wrapRef) return;
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(width * 0.55) });
    });
    obs.observe(wrapRef);
    return () => obs.disconnect();
  }, [wrapRef]);

  useEffect(() => {
    if (tab === 'traffic' && trafficRef.current && trafficData?.points)
      drawHeatmap(trafficRef.current, trafficData.points, dims.w, dims.h, 'traffic');
  }, [trafficData, dims, tab]);

  useEffect(() => {
    if (tab === 'parking' && parkingRef.current && parkingData?.points)
      drawHeatmap(parkingRef.current, parkingData.points, dims.w, dims.h, 'parking');
  }, [parkingData, dims, tab]);

  const noData = tab === 'traffic' ? !trafficData?.points?.length : !parkingData?.points?.length;

  return (
    <div className="card fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div className="section-label" style={{ marginBottom:0, flex:1 }}>
          <h3>{tab === 'traffic' ? 'Traffic Density Heatmap' : 'Parking Hotspot Heatmap'}</h3>
        </div>
        {/* Tab toggle */}
        <div style={{ display:'flex', gap:6, background:'var(--bg3)', padding:4, borderRadius:8, border:'1px solid var(--border)' }}>
          {[
            { id:'traffic', icon: Layers,  label:'Traffic Density' },
            { id:'parking', icon: MapPin,  label:'Parking Hotspots' },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer',
              background: tab === id ? (id === 'parking' ? 'var(--red)' : 'var(--accent)') : 'transparent',
              color: tab === id ? (id === 'parking' ? '#fff' : '#000') : 'var(--text2)',
              fontFamily:'var(--font-mono)', fontSize:'0.68rem',
              textTransform:'uppercase', letterSpacing:'0.05em',
              transition:'all 0.15s',
            }}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      <Legend mode={tab} />

      {/* Canvas container */}
      <div ref={setWrapRef} style={{ marginTop:14, borderRadius:'var(--radius)', overflow:'hidden', border:'1px solid var(--border)', position:'relative', minHeight:200 }}>
        {noData ? (
          <div style={{ height:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text3)', gap:10 }}>
            <Layers size={32} opacity={0.3} />
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.78rem' }}>No heatmap data available</span>
          </div>
        ) : (
          <>
            <canvas ref={trafficRef} style={{ display: tab === 'traffic' ? 'block' : 'none', width:'100%', height:'auto' }} />
            <canvas ref={parkingRef} style={{ display: tab === 'parking' ? 'block' : 'none', width:'100%', height:'auto' }} />
          </>
        )}
      </div>

      {/* Stats below map */}
      {!noData && (
        <div style={{ display:'flex', gap:16, marginTop:12, flexWrap:'wrap' }}>
          {tab === 'traffic' && trafficData && [
            { label:'Total Points', value: trafficData.total_points ?? trafficData.points?.length ?? '—' },
            { label:'Frames Analysed', value: trafficData.frames_analysed ?? '—' },
            { label:'Peak Density', value: trafficData.peak_density != null ? trafficData.peak_density.toFixed(2) : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background:'var(--bg3)', borderRadius:6, padding:'8px 14px', fontSize:'0.72rem' }}>
              <span style={{ color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', fontSize:'0.62rem' }}>{label}: </span>
              <span style={{ color:'var(--accent)', fontFamily:'var(--font-mono)', fontWeight:700 }}>{value}</span>
            </div>
          ))}
          {tab === 'parking' && parkingData && [
            { label:'Hotspots', value: parkingData.total_hotspots ?? parkingData.points?.length ?? '—' },
            { label:'High-Risk Zones', value: parkingData.high_risk_zones ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background:'var(--bg3)', borderRadius:6, padding:'8px 14px', fontSize:'0.72rem' }}>
              <span style={{ color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', fontSize:'0.62rem' }}>{label}: </span>
              <span style={{ color:'var(--red)', fontFamily:'var(--font-mono)', fontWeight:700 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Insight for heatmap */}
      {!noData && (
        <AIInsight
          key={`heatmap-${tab}-${jobId}`}
          graphType={tab === 'traffic' ? 'heatmap_traffic' : 'heatmap_parking'}
          data={tab === 'traffic' ? {
            total_points:    trafficData?.total_points ?? trafficData?.points?.length ?? 'N/A',
            frames_analysed: trafficData?.frames_analysed ?? 'N/A',
            peak_density:    trafficData?.peak_density ?? 'N/A',
          } : {
            total_hotspots:  parkingData?.total_hotspots ?? parkingData?.points?.length ?? 'N/A',
            high_risk_zones: parkingData?.high_risk_zones ?? 'N/A',
          }}
          jobId={jobId}
          autoLoad={true}
        />
      )}
    </div>
  );
}
