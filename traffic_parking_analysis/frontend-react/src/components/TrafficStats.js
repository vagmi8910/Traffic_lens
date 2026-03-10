// TrafficStats.js — Key traffic metrics display
import React from 'react';
import { Car, ParkingCircle, Gauge, Activity, Hash, Layers } from 'lucide-react';

const STAT_CONFIG = [
  { key:'total_vehicles_seen',  label:'Total Vehicles',    icon: Hash,          color:'blue',   suffix:'' },
  { key:'avg_moving_vehicles',  label:'Avg Moving',        icon: Car,           color:'green',  suffix:'/frame' },
  { key:'avg_parked_vehicles',  label:'Avg Parked',        icon: ParkingCircle, color:'red',    suffix:'/frame' },
  { key:'avg_speed_px',         label:'Avg Speed',         icon: Gauge,         color:'yellow', suffix:' px/f' },
  { key:'avg_vehicle_density',  label:'Vehicle Density',   icon: Activity,      color:'purple', suffix:'' },
  { key:'peak_vehicle_count',   label:'Peak Count',        icon: Layers,        color:'orange', suffix:' veh' },
];

export default function TrafficStats({ metrics, processing_time }) {
  if (!metrics) return null;

  return (
    <div className="fade-in">
      <div className="section-label"><h3>Traffic Metrics</h3></div>

      <div className="stat-grid">
        {STAT_CONFIG.map(({ key, label, icon: Icon, color, suffix }) => {
          const raw = metrics[key];
          const val = raw == null ? '—' : typeof raw === 'number' ? (Number.isInteger(raw) ? raw : raw.toFixed(3)) : raw;
          return (
            <div key={key} className={`stat-card ${color}`}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div className="stat-label">{label}</div>
                  <div className="stat-value">{val}</div>
                  {suffix && <div className="stat-sub" style={{ fontFamily:'var(--font-mono)' }}>{suffix}</div>}
                </div>
                <div style={{ opacity:0.25 }}>
                  <Icon size={22} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Extra row: congestion + frames + time */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:12 }}>
        {[
          { label:'Overall Congestion', value: metrics.overall_congestion || '—',
            color: metrics.overall_congestion === 'HIGH' ? 'var(--red)' : metrics.overall_congestion === 'MEDIUM' ? 'var(--yellow)' : 'var(--green)' },
          { label:'Frames Processed', value: metrics.total_frames_processed || '—', color:'var(--text)' },
          { label:'Processing Time', value: processing_time ? `${processing_time}s` : '—', color:'var(--text)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'12px 16px' }}>
            <div style={{ fontSize:'0.7rem', color:'var(--text3)', fontFamily:'var(--font-head)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.1rem', fontWeight:700, color }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
