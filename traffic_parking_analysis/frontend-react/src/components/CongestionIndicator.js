// CongestionIndicator.js — Visual congestion level display
import React from 'react';

const LEVELS = {
  LOW:    { color: 'var(--green)',  hex: '#00ff88', label: 'LOW',    desc: 'Traffic is flowing freely',                  icon: '↑' },
  MEDIUM: { color: 'var(--yellow)', hex: '#ffcc00', label: 'MEDIUM', desc: 'Moderate congestion — some delay expected',  icon: '→' },
  HIGH:   { color: 'var(--red)',    hex: '#ff3b5c', label: 'HIGH',   desc: 'Severe congestion — significant delay',      icon: '↓' },
};

export default function CongestionIndicator({ level = 'LOW', description }) {
  const cfg = LEVELS[level] || LEVELS.LOW;

  return (
    <div className="card fade-in" style={{ textAlign:'center', position:'relative', overflow:'hidden' }}>
      {/* Background glow blob */}
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        width:200, height:200, borderRadius:'50%',
        background:`radial-gradient(circle, ${cfg.hex}18 0%, transparent 70%)`,
        pointerEvents:'none',
      }} />

      <div style={{ position:'relative' }}>
        <div style={{ fontSize:'0.68rem', color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:16 }}>
          Congestion Level
        </div>

        {/* Big indicator ring */}
        <div style={{
          width:120, height:120, borderRadius:'50%',
          border:`3px solid ${cfg.color}`,
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          margin:'0 auto 16px',
          background:`${cfg.hex}10`,
          boxShadow:`0 0 30px ${cfg.hex}30, inset 0 0 20px ${cfg.hex}08`,
          position:'relative',
        }}>
          {/* Spinning ring */}
          <div style={{
            position:'absolute', inset:-6,
            borderRadius:'50%',
            border:`2px solid transparent`,
            borderTopColor: cfg.color,
            borderRightColor: `${cfg.hex}40`,
            animation: level === 'HIGH' ? 'spin 1.5s linear infinite' : level === 'MEDIUM' ? 'spin 3s linear infinite' : 'none',
          }} />
          <div style={{ fontSize:'2.2rem', fontFamily:'var(--font-mono)', fontWeight:700, color:cfg.color, lineHeight:1 }}>
            {cfg.icon}
          </div>
          <div style={{ fontSize:'0.6rem', color:cfg.color, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:4 }}>
            {cfg.label}
          </div>
        </div>

        <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.1rem', fontWeight:700, color:cfg.color, marginBottom:8 }}>
          {level} CONGESTION
        </div>
        <div style={{ fontSize:'0.78rem', color:'var(--text2)', maxWidth:220, margin:'0 auto' }}>
          {description || cfg.desc}
        </div>

        {/* Level bars */}
        <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:20 }}>
          {['LOW','MEDIUM','HIGH'].map(l => (
            <div key={l} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{
                width:32, height: l === 'LOW' ? 12 : l === 'MEDIUM' ? 20 : 28,
                borderRadius:3,
                background: ['LOW','MEDIUM','HIGH'].indexOf(l) <= ['LOW','MEDIUM','HIGH'].indexOf(level)
                  ? LEVELS[l].hex
                  : 'var(--border)',
                transition:'background 0.3s',
              }} />
              <span style={{ fontSize:'0.55rem', color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
