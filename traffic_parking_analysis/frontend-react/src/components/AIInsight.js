// AIInsight.js — AI explanation panel with bullet point rendering
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { explainGraph } from '../api';

export default function AIInsight({ graphType, data, jobId, autoLoad = true }) {
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [fetched, setFetched] = useState(false);
  const prevType = useRef('');

  useEffect(() => {
    if (autoLoad && !fetched && graphType !== prevType.current) {
      prevType.current = graphType;
      fetchInsight();
    }
  }, [graphType, autoLoad]); // eslint-disable-line

  const fetchInsight = async () => {
    if (!data || !graphType) return;
    setLoading(true);
    setError('');
    try {
      const resp = await explainGraph(graphType, data || {}, jobId);
      setInsight(resp.data.insight || '');
      setFetched(true);
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || 'Failed to generate explanation';
      if (msg.includes('GROQ') || msg.includes('groq') || e.response?.status === 503) {
        setError('AI explanations require a GROQ_API_KEY environment variable. Set it and restart the backend.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => { setFetched(false); setInsight(''); fetchInsight(); };

  return (
    <div style={{
      marginTop: 20,
      borderRadius: 'var(--radius)',
      border: '1px solid rgba(168,85,247,0.3)',
      background: 'linear-gradient(135deg, rgba(168,85,247,0.06) 0%, rgba(168,85,247,0.02) 100%)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(168,85,247,0.2)' : 'none',
          background: 'rgba(168,85,247,0.05)',
        }}
      >
        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Sparkles size={14} color="#a855f7" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7' }}>
            AI Insight
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginTop: 1 }}>
            Key points powered by LLaMA 3 via Groq
          </div>
        </div>

        {!loading && (
          <button
            onClick={e => { e.stopPropagation(); handleRefresh(); }}
            style={{
              background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
              color: '#a855f7', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: '0.65rem', fontFamily: 'var(--font-mono)',
            }}
          >
            <RefreshCw size={11} /> Refresh
          </button>
        )}
        {expanded ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: '16px 20px' }}>

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2px solid rgba(168,85,247,0.2)',
                borderTopColor: '#a855f7',
                animation: 'spin 0.8s linear infinite', flexShrink: 0,
              }} />
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a855f7', marginBottom: 3 }}>
                  Generating AI insights...
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text3)' }}>
                  LLaMA 3 is analysing your traffic data
                </div>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
              <AlertCircle size={16} color="var(--yellow)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text)', marginBottom: 4 }}>AI explanation unavailable</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text2)', lineHeight: 1.6 }}>{error}</div>
              </div>
            </div>
          )}

          {/* Bullet point insight */}
          {!loading && !error && insight && (
            <BulletInsight text={insight} />
          )}

          {/* Not yet loaded */}
          {!loading && !error && !insight && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <button
                onClick={fetchInsight}
                style={{
                  background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)',
                  borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
                  color: '#a855f7', fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <Sparkles size={14} /> Generate AI Insights
              </button>
              <div style={{ fontSize: '0.68rem', color: 'var(--text3)', marginTop: 8 }}>
                Powered by LLaMA 3 via Groq
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bullet point renderer with typewriter animation ──────────────────────────

function BulletInsight({ text }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);

  // Parse lines that start with • (or - or * as fallback)
  const bullets = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => l.replace(/^[•\-\*]\s*/, '').trim())
    .filter(l => l.length > 0);

  useEffect(() => {
    setVisibleCount(0);
    setDone(false);
    if (bullets.length === 0) return;

    // Reveal one bullet every 300ms
    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= bullets.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [text]); // eslint-disable-line

  return (
    <div>
      {/* Bullet count badge */}
      {done && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
          color: '#a855f7', background: 'rgba(168,85,247,0.1)',
          border: '1px solid rgba(168,85,247,0.2)',
          borderRadius: 4, padding: '2px 8px', marginBottom: 12,
        }}>
          <Sparkles size={9} /> {bullets.length} key points
        </div>
      )}

      {/* Bullets */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bullets.slice(0, visibleCount).map((bullet, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              animation: 'fadeSlideIn 0.3s ease',
            }}
          >
            {/* Purple dot */}
            <div style={{
              width: 7, height: 7,
              borderRadius: '50%',
              background: '#a855f7',
              boxShadow: '0 0 6px rgba(168,85,247,0.5)',
              flexShrink: 0,
              marginTop: 6,
            }} />
            {/* Text */}
            <span style={{
              fontSize: '0.82rem',
              color: 'var(--text)',
              lineHeight: 1.7,
            }}>
              {bullet}
            </span>
          </li>
        ))}
      </ul>

      {/* Typing indicator while more bullets are coming */}
      {!done && visibleCount < bullets.length && (
        <div style={{ display: 'flex', gap: 4, marginTop: 10, paddingLeft: 17 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#a855f7', opacity: 0.5,
              animation: `pulse 1s infinite ${i * 0.2}s`,
            }} />
          ))}
        </div>
      )}

      {/* Bottom accent */}
      {done && (
        <div style={{
          marginTop: 14, height: 1,
          background: 'linear-gradient(90deg, rgba(168,85,247,0.4), transparent)',
        }} />
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}