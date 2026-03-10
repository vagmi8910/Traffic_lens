// api.js — Axios client for FastAPI backend
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 60000,
});

// ── Upload & Process ──────────────────────────────────────────────────────

export const uploadVideo = (file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return API.post('/upload-video', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress && onProgress(Math.round((e.loaded * 100) / e.total)),
  });
};

export const processVideo = (jobId, options = {}) =>
  API.post('/process-video', {
    job_id: jobId,
    conf_threshold: options.confThreshold ?? 0.4,
    n_lanes: options.nLanes ?? 3,
    min_stationary_frames: options.minStationaryFrames ?? 20,
  });

export const getJobStatus = jobId => API.get(`/job-status/${jobId}`);

// ── Results ───────────────────────────────────────────────────────────────

export const getTrafficMetrics    = jobId => API.get('/traffic-metrics',    { params: { job_id: jobId } });
export const getCongestionLevel   = jobId => API.get('/congestion-level',   { params: { job_id: jobId } });
export const getLaneBlockage      = jobId => API.get('/lane-blockage',      { params: { job_id: jobId } });
export const getParkingViolations = jobId => API.get('/parking-violations', { params: { job_id: jobId } });
export const getTimeline          = jobId => API.get(`/timeline/${jobId}`);

// ── Heatmap ───────────────────────────────────────────────────────────────

export const getTrafficDensityHeatmap  = jobId => API.get('/heatmap/traffic-density',  { params: { job_id: jobId } });
export const getParkingHotspotsHeatmap = jobId => API.get('/heatmap/parking-hotspots', { params: { job_id: jobId } });
export const getVehicleTrajectories    = jobId => API.get('/analytics/vehicle-trajectories', { params: { job_id: jobId } });

// ── AI Explanations ───────────────────────────────────────────────────────

export const explainGraph = (graphType, data, jobId) =>
  API.post('/analytics/explain', { graph_type: graphType, data, job_id: jobId });

// ── Video download URL ────────────────────────────────────────────────────

export const getVideoUrl = jobId => `http://localhost:8000/download-video/${jobId}`;

// ── Health ────────────────────────────────────────────────────────────────

export const healthCheck = () => API.get('/health');

export default API;
