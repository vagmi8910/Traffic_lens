// VideoUpload.js — Video upload with drag-and-drop
import React, { useState, useRef, useCallback } from 'react';
import { Upload, Film, Settings, ChevronRight, AlertCircle } from 'lucide-react';
import { uploadVideo, processVideo } from '../api';

export default function VideoUpload({ onJobStarted }) {
  const [file, setFile]             = useState(null);
  const [dragging, setDragging]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadPct, setUploadPct]   = useState(0);
  const [error, setError]           = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef();

  // Settings state
  const [conf, setConf]               = useState(0.4);
  const [lanes, setLanes]             = useState(3);
  const [stationaryFrames, setStationary] = useState(20);

  const ALLOWED = ['video/mp4','video/avi','video/quicktime','video/x-matroska','video/webm'];

  const validate = f => {
    if (!f) return 'No file selected';
    if (!ALLOWED.includes(f.type) && !f.name.match(/\.(mp4|avi|mov|mkv|webm)$/i))
      return 'Unsupported format. Use MP4, AVI, MOV or MKV.';
    if (f.size > 500 * 1024 * 1024) return 'File too large (max 500 MB)';
    return '';
  };

  const handleFile = f => {
    const err = validate(f);
    if (err) { setError(err); return; }
    setError('');
    setFile(f);
  };

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const onDragOver = e => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleSubmit = async () => {
    if (!file) return;
    setError(''); setUploading(true); setUploadPct(0);
    try {
      const upResp = await uploadVideo(file, pct => setUploadPct(pct));
      const { job_id } = upResp.data;
      await processVideo(job_id, { confThreshold: conf, nLanes: lanes, minStationaryFrames: stationaryFrames });
      onJobStarted(job_id);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const fmt = bytes => {
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/(1024*1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card fade-in" style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <div style={{ width:36, height:36, borderRadius:8, background:'rgba(0,212,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(0,212,255,0.2)' }}>
          <Film size={18} color="var(--accent)" />
        </div>
        <div>
          <h2 style={{ fontSize:'1.2rem', marginBottom:4 }}>Upload Traffic Video</h2>
          <p style={{ color:'var(--text3)', fontSize:'0.8rem', fontFamily:'var(--font-mono)' }}>MP4 · AVI · MOV · MKV · up to 500MB</p>
        </div>
        <button className="btn btn-ghost" style={{ marginLeft:'auto', fontSize:'0.7rem', padding:'6px 12px' }} onClick={() => setShowSettings(!showSettings)}>
          <Settings size={13} /> Settings
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:16, marginBottom:20, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
          {[
            { label:'Conf Threshold', val:conf, set:setConf, min:0.1, max:0.9, step:0.05 },
            { label:'Num Lanes', val:lanes, set:setLanes, min:1, max:6, step:1 },
            { label:'Min Stationary Frames', val:stationaryFrames, set:setStationary, min:5, max:60, step:5 },
          ].map(({ label, val, set, min, max, step }) => (
            <div key={label}>
              <div style={{ fontSize:'0.68rem', color:'var(--text3)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>{label}</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(Number(e.target.value))}
                  style={{ flex:1, accentColor:'var(--accent)' }} />
                <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--accent)', minWidth:28, textAlign:'right' }}>{val}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => !file && inputRef.current.click()}
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : file ? 'var(--green)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          padding: file ? '20px 24px' : '48px 24px',
          textAlign: 'center',
          cursor: file ? 'default' : 'pointer',
          transition: 'all 0.2s',
          background: dragging ? 'rgba(0,212,255,0.04)' : file ? 'rgba(0,255,136,0.03)' : 'var(--bg3)',
          marginBottom: 16,
        }}
      >
        <input ref={inputRef} type="file" accept=".mp4,.avi,.mov,.mkv,.webm" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])} />

        {file ? (
          <div style={{ display:'flex', alignItems:'center', gap:16, textAlign:'left' }}>
            <div style={{ width:44, height:44, borderRadius:8, background:'rgba(0,255,136,0.1)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(0,255,136,0.2)', flexShrink:0 }}>
              <Film size={20} color="var(--green)" />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.85rem', color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{file.name}</div>
              <div style={{ fontSize:'0.72rem', color:'var(--text2)', marginTop:3 }}>{fmt(file.size)}</div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize:'0.65rem', padding:'5px 10px' }} onClick={e => { e.stopPropagation(); setFile(null); setError(''); }}>
              Change
            </button>
          </div>
        ) : (
          <>
            <Upload size={48} color="var(--accent)" style={{ marginBottom:16, filter:'drop-shadow(0 0 12px rgba(0,230,255,0.4))' }} />
            <div style={{ color:'var(--text)', fontSize:'1.1rem', fontFamily:'var(--font-head)', fontWeight:600, marginBottom:8 }}>
              {dragging ? 'Release to upload video' : 'Drag & drop or browse to upload'}
            </div>
            <div style={{ color:'var(--text3)', fontSize:'0.85rem', fontFamily:'var(--font-mono)' }}>
              Traffic surveillance videos work best
            </div>
          </>
        )}
      </div>

      {/* Upload progress */}
      {uploading && (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'var(--text2)', fontFamily:'var(--font-mono)', marginBottom:6 }}>
            <span>{uploadPct < 100 ? 'Uploading...' : 'Starting pipeline...'}</span>
            <span>{uploadPct}%</span>
          </div>
          <div className="progress-bar"><div className="progress-bar-fill" style={{ width:`${uploadPct}%` }} /></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom:16 }}>
          <AlertCircle size={15} style={{ flexShrink:0, marginTop:1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', padding:'12px 24px', fontSize:'0.82rem' }}
        onClick={handleSubmit} disabled={!file || uploading}>
        {uploading ? (
          <><span className="pulse">●</span> Processing...</>
        ) : (
          <>Analyse Video <ChevronRight size={15} /></>
        )}
      </button>
    </div>
  );
}
