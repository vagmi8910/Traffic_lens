// TrafficGraphs.js
import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, LabelList,
} from 'recharts';
import AIInsight from './AIInsight';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
      {label !== undefined && <div style={{ color: 'var(--text3)', marginBottom: 6 }}>Frame {label}</div>}
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const Tab = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
    background: active ? 'var(--accent)' : 'var(--bg3)',
    color: active ? '#000' : 'var(--text2)',
    fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
    textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'all 0.15s',
  }}>{children}</button>
);

const sample = (arr, n = 200) => {
  if (!arr?.length) return [];
  if (arr.length <= n) return arr;
  const step = Math.ceil(arr.length / n);
  return arr.filter((_, i) => i % step === 0);
};

// ── Chart 1 ─────────────────────────────────────────────────────────────────
function VehiclesTimeChart({ data }) {
  const s = sample(data);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={s} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
        <defs>
          <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} /><stop offset="95%" stopColor="#00d4ff" stopOpacity={0} /></linearGradient>
          <linearGradient id="gParked" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ff3b5c" stopOpacity={0.3} /><stop offset="95%" stopColor="#ff3b5c" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="frame_id" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }} />
        <Area type="monotone" dataKey="total" name="Total" stroke="#00d4ff" fill="url(#gTotal)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="moving" name="Moving" stroke="#00ff88" fill="none" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
        <Area type="monotone" dataKey="parked" name="Parked" stroke="#ff3b5c" fill="url(#gParked)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Chart 2 ─────────────────────────────────────────────────────────────────
function ParkedCongestionChart({ data }) {
  const s = sample(data);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={s} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="frame_id" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }} />
        <Bar dataKey="parked" name="Parked Vehicles" fill="#ff3b5c" opacity={0.85} radius={[2, 2, 0, 0]} />
        <Bar dataKey="moving" name="Moving Vehicles" fill="#00d4ff" opacity={0.6} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 3 ─────────────────────────────────────────────────────────────────
function SpeedDensityChart({ data }) {
  const s = sample(data, 150).map(d => ({
    density: parseFloat((d.density || 0).toFixed(4)),
    speed: parseFloat((d.avg_speed || 0).toFixed(2)),
    cong: d.congestion,
  }));
  const colors = { LOW: '#00ff88', MEDIUM: '#ffcc00', HIGH: '#ff3b5c' };
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="density" name="Density" type="number" tick={{ fontSize: 10, fill: 'var(--text3)' }}
          label={{ value: 'Density', position: 'insideBottom', offset: -12, style: { fontSize: 10, fill: 'var(--text3)' } }} />
        <YAxis dataKey="speed" name="Avg Speed" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0]?.payload;
          return (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              <div style={{ color: colors[d?.cong] || 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{d?.cong}</div>
              <div>Density: {d?.density}</div>
              <div>Speed: {d?.speed} px/f</div>
            </div>
          );
        }} />
        {['LOW', 'MEDIUM', 'HIGH'].map(c => (
          <Scatter key={c} name={c} data={s.filter(d => d.cong === c)} fill={colors[c]} opacity={0.75} />
        ))}
        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ── Chart 4: Lane Blockage — FIXED ───────────────────────────────────────────
function LaneBlockageChart({ laneData }) {
  // Guard: no data
  if (!laneData || Object.keys(laneData).length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 280, gap: 10 }}>
        <div style={{ fontSize: '2rem' }}>🛣️</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text3)' }}>No lane blockage data available</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text3)', maxWidth: 320, textAlign: 'center' }}>Lane data is populated after video processing completes.</div>
      </div>
    );
  }

  // Build rows — handle both numeric and string keys, handle missing fields
  const rows = Object.entries(laneData).map(([id, info]) => {
    const avg = typeof info === 'object' ? Number(info.avg_blockage_pct ?? 0) : Number(info) || 0;
    const max = typeof info === 'object' ? Number(info.max_blockage_pct ?? avg) : avg;
    return {
      lane: `Lane ${id}`,
      avg: Math.round(avg * 10) / 10,
      max: Math.round(max * 10) / 10,
      status: typeof info === 'object' ? (info.status || '') : '',
    };
  });

  // Dynamic domain — always show at least 0–20 so bars are visible even when values are tiny
  const maxVal = Math.max(...rows.map(r => r.max), 20);
  const domain = [0, Math.ceil(maxVal * 1.25)]; // 25% headroom for labels

  // Color each avg bar by severity
  const barColor = pct => pct >= 50 ? '#ff3b5c' : pct >= 20 ? '#ffcc00' : '#00d4ff';

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 30, right: 20, bottom: 5, left: 10 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="lane" tick={{ fontSize: 12, fill: 'var(--text2)', fontWeight: 600 }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} domain={domain} unit="%" tickFormatter={v => `${v}%`} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const row = rows.find(r => r.lane === label);
          return (
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ color: '#00d4ff', marginBottom: 2 }}>Avg Blockage: {payload[0]?.value}%</div>
              <div style={{ color: '#ff8c00' }}>Peak Blockage: {payload[1]?.value}%</div>
              {row?.status && <div style={{ color: 'var(--text3)', marginTop: 4 }}>{row.status}</div>}
            </div>
          );
        }} />
        <Legend wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }} />

        {/* Avg bar — colored by severity, label on top */}
        <Bar dataKey="avg" name="Avg Blockage %" radius={[6, 6, 0, 0]}>
          {rows.map((r, i) => <Cell key={i} fill={barColor(r.avg)} />)}
          <LabelList dataKey="avg" position="top" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--text2)', fontWeight: 700 }} formatter={v => `${v}%`} />
        </Bar>

        {/* Peak bar — always orange, label on top */}
        <Bar dataKey="max" name="Peak Blockage %" fill="#ff8c00" opacity={0.45} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="max" position="top" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: '#ff8c00' }} formatter={v => `${v}%`} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart 5 ─────────────────────────────────────────────────────────────────
function DensityTrendChart({ data }) {
  const s = sample(data);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={s} margin={{ top: 10, right: 20, bottom: 5, left: 10 }}>
        <defs>
          <linearGradient id="gDensity" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} /><stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="frame_id" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
        <Tooltip content={<CustomTooltip />} />
        <Area type="monotone" dataKey="density" name="Density" stroke="#a855f7" fill="url(#gDensity)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── AI data builders ────────────────────────────────────────────────────────
const buildVehiclesTimeData = tl => ({ vehicle_counts: sample(tl, 20).map(d => d.total).join(', '), timestamps: sample(tl, 20).map(d => `f${d.frame_id}`).join(', '), avg_moving: (tl.reduce((a, d) => a + (d.moving || 0), 0) / tl.length).toFixed(1), avg_parked: (tl.reduce((a, d) => a + (d.parked || 0), 0) / tl.length).toFixed(1), congestion_level: [...new Set(tl.map(d => d.congestion))].join(', ') });
const buildParkedCongData = tl => { const cc = { LOW: 0, MEDIUM: 0, HIGH: 0 }; tl.forEach(d => { cc[d.congestion] = (cc[d.congestion] || 0) + 1; }); const dom = Object.entries(cc).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'; return { parked_counts: sample(tl, 20).map(d => d.parked).join(', '), congestion_levels: sample(tl, 20).map(d => d.congestion).join(', '), peak_parked: Math.max(...tl.map(d => d.parked)), dominant_congestion: dom, lane_blockage: 'see lane blockage chart' }; };
const buildSpeedDensityData = tl => { const lo = tl.filter(d => d.density < 0.04), hi = tl.filter(d => d.density >= 0.08); return { avg_speed: (tl.reduce((a, d) => a + (d.avg_speed || 0), 0) / tl.length).toFixed(2), avg_density: (tl.reduce((a, d) => a + (d.density || 0), 0) / tl.length).toFixed(4), speed_low_density: lo.length ? (lo.reduce((a, d) => a + (d.avg_speed || 0), 0) / lo.length).toFixed(2) : 'N/A', speed_high_density: hi.length ? (hi.reduce((a, d) => a + (d.avg_speed || 0), 0) / hi.length).toFixed(2) : 'N/A', congestion_level: [...new Set(tl.map(d => d.congestion))].join(', ') }; };
const buildLaneBlockageData = ld => { if (!ld || !Object.keys(ld).length) return {}; const e = Object.entries(ld); const m = e.sort((a, b) => (b[1].avg_blockage_pct || 0) - (a[1].avg_blockage_pct || 0))[0]; return { lane_blockage: e.map(([id, v]) => `Lane ${id}: ${v.avg_blockage_pct || 0}%`).join(', '), num_lanes: e.length, most_blocked_lane: m ? `Lane ${m[0]}` : 'N/A', max_blockage: m ? (m[1].avg_blockage_pct || 0) : 'N/A', violations: 'see violations panel' }; };
const buildDensityTrendData = tl => { const d = tl.map(f => f.density || 0); return { density_values: sample(tl, 20).map(f => (f.density || 0).toFixed(4)).join(', '), peak_density: Math.max(...d).toFixed(4), avg_density: (d.reduce((a, b) => a + b, 0) / d.length).toFixed(4), frames_analysed: tl.length, congestion_level: [...new Set(tl.map(f => f.congestion))].join(', ') }; };

// ── Main ─────────────────────────────────────────────────────────────────────
const TABS = [
  { label: 'Vehicles / Time', graphType: 'vehicles_time' },
  { label: 'Parked vs Congestion', graphType: 'parked_congestion' },
  { label: 'Speed vs Density', graphType: 'speed_density' },
  { label: 'Lane Blockage', graphType: 'lane_blockage' },
  { label: 'Density Trend', graphType: 'density_trend' },
];

export default function TrafficGraphs({ timeline, laneData, jobId }) {
  const [tab, setTab] = useState(0);
  if (!timeline?.length) return null;

  const charts = [
    <VehiclesTimeChart data={timeline} />,
    <ParkedCongestionChart data={timeline} />,
    <SpeedDensityChart data={timeline} />,
    <LaneBlockageChart laneData={laneData} />,
    <DensityTrendChart data={timeline} />,
  ];

  const aiData = useMemo(() => [
    buildVehiclesTimeData(timeline),
    buildParkedCongData(timeline),
    buildSpeedDensityData(timeline),
    buildLaneBlockageData(laneData),
    buildDensityTrendData(timeline),
  ], [timeline, laneData]);

  return (
    <div className="card fade-in">
      <div className="section-label" style={{ marginBottom: 16 }}><h3>Analytics Charts</h3></div>

      {/* Tab buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
        {TABS.map((t, i) => (
          <Tab key={t.label} active={tab === i} onClick={() => setTab(i)}>{t.label}</Tab>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ background: 'var(--bg3)', borderRadius: 'var(--radius)', padding: '16px 8px', minHeight: 300 }}>
        {charts[tab]}
      </div>

      {/* Status pills shown only on Lane Blockage tab */}
      {tab === 3 && laneData && Object.keys(laneData).length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
          {Object.entries(laneData).map(([id, info]) => {
            const pct = info.avg_blockage_pct || 0;
            const color = pct >= 50 ? 'var(--red)' : pct >= 20 ? 'var(--yellow)' : 'var(--green)';
            return (
              <div key={id} style={{ background: 'var(--bg3)', border: `1px solid ${color}40`, borderRadius: 8, padding: '10px 18px', minWidth: 100, textAlign: 'center' }}>
                <div style={{ fontSize: '0.62rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>Lane {id}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color }}>{pct}%</div>
                <div style={{ fontSize: '0.65rem', color, fontFamily: 'var(--font-mono)', marginTop: 3 }}>{info.status || 'OK'}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Insight */}
      <AIInsight
        key={`${tab}-${jobId}`}
        graphType={TABS[tab].graphType}
        data={aiData[tab]}
        jobId={jobId}
        autoLoad={true}
      />
    </div>
  );
}