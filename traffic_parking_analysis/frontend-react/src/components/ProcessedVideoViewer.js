// ProcessedVideoViewer.js — Video player for processed output
import React, { useRef, useState } from 'react';
import { Play, Pause, Download, Film } from 'lucide-react';
import { getVideoUrl } from '../api';

export default function ProcessedVideoViewer({ jobId }) {
  const videoRef = useRef();
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState(0);

  if (!jobId) return null;
  const src = getVideoUrl(jobId);

  // ── Blob download — forces save-to-disk, never navigates away ──────────────
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    setDlProgress(0);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error('Download failed');

      const contentLength = response.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) setDlProgress(Math.round((received / total) * 100));
      }

      const blob = new Blob(chunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `traffic_analysis_${jobId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloading(false);
      setDlProgress(0);
    }
  };

  // ── Playback ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().then(() => setPlaying(true)).catch(() => setError(true)); }
  };

  const onTimeUpdate = () => {
    if (!videoRef.current || !videoRef.current.duration) return;
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
  };

  const onSeek = e => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    videoRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const fmt = s => `${Math.floor((s || 0) / 60).toString().padStart(2, '0')}:${Math.floor((s || 0) % 60).toString().padStart(2, '0')}`;

  return (
    <div className="card fade-in">
      <div className="section-label" style={{ marginBottom: 14 }}>
        <Film size={14} color="var(--accent)" />
        <h3>Processed Video</h3>
      </div>

      {/* Video player */}
      {!error && (
        <div style={{ position: 'relative', background: '#000', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <video
            ref={videoRef}
            src={src}
            style={{ width: '100%', display: 'block', maxHeight: 420 }}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onEnded={() => setPlaying(false)}
            onError={() => setError(true)}
            preload="metadata"
          />
          {!playing && (
            <div onClick={togglePlay} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', cursor: 'pointer' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,212,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(0,212,255,0.4)' }}>
                <Play size={22} color="#000" style={{ marginLeft: 3 }} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stream error notice */}
      {error && (
        <div className="alert alert-warning" style={{ marginBottom: 12 }}>
          <span>Video cannot be streamed in browser. Use Download below to watch locally.</span>
        </div>
      )}

      {/* Controls */}
      <div style={{ marginTop: error ? 0 : 12 }}>
        {!error && (
          <div onClick={onSeek} style={{ height: 4, background: 'var(--border)', borderRadius: 2, cursor: 'pointer', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--accent2),var(--accent))', borderRadius: 2, width: `${progress}%`, transition: 'width 0.1s' }} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!error && (
            <>
              <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={togglePlay}>
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text3)' }}>
                {fmt(videoRef.current?.currentTime)} / {fmt(duration)}
              </span>
            </>
          )}

          <div style={{ flex: 1 }} />

          {/* Download button — blob fetch, always saves to disk */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="btn btn-primary"
            style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.78rem', opacity: downloading ? 0.75 : 1, cursor: downloading ? 'wait' : 'pointer' }}
          >
            <Download size={14} />
            {downloading
              ? (dlProgress > 0 ? `Downloading ${dlProgress}%...` : 'Downloading...')
              : 'Download Video'}
          </button>
        </div>

        {/* Download progress bar */}
        {downloading && dlProgress > 0 && (
          <div style={{ marginTop: 8, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--accent)', width: `${dlProgress}%`, transition: 'width 0.2s' }} />
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
        {[
          { color: 'var(--green)', label: 'Moving Vehicle' },
          { color: 'var(--red)', label: 'Parked Vehicle' },
          { color: 'var(--accent)', label: 'Lane Region' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}