// ParkingAlerts.js — Parking violation alerts display
import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

const SEVERITY_CFG = {
  HIGH:   { color:'var(--red)',    bg:'rgba(255,59,92,0.06)',  border:'rgba(255,59,92,0.25)',  icon: ShieldAlert,    label:'HIGH RISK' },
  MEDIUM: { color:'var(--yellow)', bg:'rgba(255,204,0,0.06)', border:'rgba(255,204,0,0.25)', icon: AlertTriangle,  label:'MEDIUM' },
  LOW:    { color:'var(--accent)', bg:'rgba(0,212,255,0.06)', border:'rgba(0,212,255,0.25)', icon: AlertTriangle,  label:'LOW' },
};

function ViolationRow({ v, index }) {
  const cfg = SEVERITY_CFG[v.severity] || SEVERITY_CFG.MEDIUM;
  const Icon = cfg.icon;
  return (
    <tr style={{ animation:`fadeIn 0.3s ease ${index * 0.05}s both` }}>
      <td>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Icon size={13} color={cfg.color} />
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:cfg.color,
            background:cfg.bg, border:`1px solid ${cfg.border}`, padding:'2px 8px', borderRadius:4 }}>
            {cfg.label}
          </span>
        </div>
      </td>
      <td style={{ fontFamily:'var(--font-mono)', color:'var(--accent)', fontSize:'0.8rem' }}>#{v.track_id}</td>
      <td style={{ color:'var(--text)' }}>{v.lane}</td>
      <td>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ flex:1, height:5, background:'var(--border)', borderRadius:3, overflow:'hidden', maxWidth:80 }}>
            <div style={{ height:'100%', borderRadius:3, width:`${Math.min(100, v.blockage_pct)}%`,
              background: v.blockage_pct > 60 ? 'var(--red)' : v.blockage_pct > 30 ? 'var(--yellow)' : 'var(--green)' }} />
          </div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text2)' }}>
            {v.blockage_pct?.toFixed(1)}%
          </span>
        </div>
      </td>
      <td style={{ fontFamily:'var(--font-mono)', fontSize:'0.72rem', color:'var(--text3)' }}>
        f{v.frame_id}
      </td>
    </tr>
  );
}

export default function ParkingAlerts({ violations }) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter]     = useState('ALL');

  if (!violations) return null;

  const list  = violations.violations || [];
  const total = violations.total_violations || 0;
  const high  = list.filter(v => v.severity === 'HIGH').length;
  const medium= list.filter(v => v.severity === 'MEDIUM').length;

  const filtered = filter === 'ALL' ? list : list.filter(v => v.severity === filter);

  return (
    <div className="card fade-in">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: expanded ? 16 : 0, cursor:'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <AlertTriangle size={16} color={total > 0 ? 'var(--yellow)' : 'var(--green)'} />
        <h3 style={{ flex:1, margin:0 }}>Parking Violation Alerts</h3>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {high > 0   && <span className="tag red">{high} HIGH</span>}
          {medium > 0 && <span className="tag yellow">{medium} MED</span>}
          {total === 0 && <span className="tag green">CLEAR</span>}
          {expanded ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
        </div>
      </div>

      {expanded && (
        <>
          {total === 0 ? (
            <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--green)', padding:'12px 0' }}>
              <CheckCircle size={18} />
              <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>No parking violations detected</span>
            </div>
          ) : (
            <>
              {/* Summary chips */}
              <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
                {['ALL','HIGH','MEDIUM'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding:'4px 12px', borderRadius:5, border:'1px solid',
                    borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
                    background: filter === f ? 'rgba(0,212,255,0.1)' : 'transparent',
                    color: filter === f ? 'var(--accent)' : 'var(--text3)',
                    fontFamily:'var(--font-mono)', fontSize:'0.65rem', cursor:'pointer',
                    textTransform:'uppercase', letterSpacing:'0.06em',
                  }}>{f} {f === 'ALL' ? `(${total})` : f === 'HIGH' ? `(${high})` : `(${medium})`}</button>
                ))}
              </div>

              {/* Table */}
              <div style={{ overflowX:'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Vehicle ID</th>
                      <th>Lane</th>
                      <th>Blockage</th>
                      <th>Frame</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((v, i) => (
                      <ViolationRow key={`${v.track_id}-${v.lane}-${i}`} v={v} index={i} />
                    ))}
                  </tbody>
                </table>
                {filtered.length > 50 && (
                  <div style={{ textAlign:'center', padding:'10px', color:'var(--text3)', fontFamily:'var(--font-mono)', fontSize:'0.72rem' }}>
                    + {filtered.length - 50} more violations
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
