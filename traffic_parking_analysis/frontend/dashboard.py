"""
dashboard.py  –  Streamlit Frontend
-------------------------------------
Interactive dashboard for the AI-Based Roadside Parking Impact Analysis system.

Run with:
    streamlit run frontend/dashboard.py
"""

import time
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any

import requests
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
import streamlit as st

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

API_BASE = "http://localhost:8000"
POLL_INTERVAL_S = 2       # how often to check job status
MAX_POLL_ATTEMPTS = 180   # ~6 minutes timeout

st.set_page_config(
    page_title="Traffic Parking Impact Analyser",
    page_icon="🚦",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Session state defaults
# ---------------------------------------------------------------------------
for key, default in {
    "job_id": None,
    "summary": None,
    "timeline": None,
    "congestion": None,
    "lane_blockage": None,
    "violations": None,
    "metrics": None,
}.items():
    if key not in st.session_state:
        st.session_state[key] = default


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def api_get(path: str, params: dict = None) -> Optional[Dict]:
    try:
        r = requests.get(f"{API_BASE}{path}", params=params, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        st.error(f"API error ({path}): {e}")
        return None


def api_post(path: str, json_data: dict = None, files=None) -> Optional[Dict]:
    try:
        r = requests.post(
            f"{API_BASE}{path}",
            json=json_data,
            files=files,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        st.error(f"API error ({path}): {e}")
        return None


def check_backend() -> bool:
    try:
        r = requests.get(f"{API_BASE}/health", timeout=5)
        return r.status_code == 200
    except Exception:
        return False


def poll_until_done(job_id: str, progress_bar, status_text) -> bool:
    """
    Poll job status without blocking Streamlit's session.
    Uses short sleeps with periodic rerun to keep session alive.
    """
    for attempt in range(MAX_POLL_ATTEMPTS):
        try:
            status = api_get(f"/job-status/{job_id}")
        except Exception:
            time.sleep(2)
            continue

        if status is None:
            time.sleep(2)
            continue

        state = status.get("status", "unknown")
        status_text.text(f"⏳ Processing... (status: {state})")

        if state == "completed":
            progress_bar.progress(1.0)
            return True

        if state == "failed":
            st.error(f"Processing failed: {status.get('error', 'Unknown error')}")
            return False

        pct = min(0.95, 0.05 + attempt / MAX_POLL_ATTEMPTS * 0.9)
        progress_bar.progress(pct)
        time.sleep(3)

    st.error("Processing timed out.")
    return False


def load_results(job_id: str) -> None:
    st.session_state.metrics      = api_get("/traffic-metrics",    {"job_id": job_id})
    st.session_state.congestion   = api_get("/congestion-level",   {"job_id": job_id})
    st.session_state.lane_blockage = api_get("/lane-blockage",     {"job_id": job_id})
    st.session_state.violations   = api_get("/parking-violations", {"job_id": job_id})
    tl = api_get(f"/timeline/{job_id}")
    st.session_state.timeline     = tl.get("timeline", []) if tl else []


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------

def chart_vehicles_over_time(timeline: list) -> go.Figure:
    df = pd.DataFrame(timeline)
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df["frame_id"], y=df["total"],
                             name="Total Vehicles", line=dict(color="#00b4d8", width=2)))
    fig.add_trace(go.Scatter(x=df["frame_id"], y=df["moving"],
                             name="Moving", line=dict(color="#06d6a0", width=2)))
    fig.add_trace(go.Scatter(x=df["frame_id"], y=df["parked"],
                             name="Parked", fill="tozeroy",
                             line=dict(color="#ef233c", width=2),
                             fillcolor="rgba(239,35,60,0.15)"))
    fig.update_layout(
        title="Vehicle Count Over Time",
        xaxis_title="Frame",
        yaxis_title="Vehicle Count",
        template="plotly_dark",
        legend=dict(orientation="h"),
        height=350,
    )
    return fig


def chart_speed_vs_density(timeline: list) -> go.Figure:
    df = pd.DataFrame(timeline)
    fig = px.scatter(
        df, x="density", y="avg_speed",
        color="congestion",
        color_discrete_map={"LOW": "#06d6a0", "MEDIUM": "#ffd166", "HIGH": "#ef233c"},
        title="Vehicle Speed vs Density",
        labels={"density": "Density (veh/1000px²)", "avg_speed": "Avg Speed (px/frame)"},
        template="plotly_dark",
    )
    fig.update_layout(height=350)
    return fig


def chart_parked_vs_congestion(timeline: list) -> go.Figure:
    df = pd.DataFrame(timeline)
    cong_num = df["congestion"].map({"LOW": 1, "MEDIUM": 2, "HIGH": 3})
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=df["frame_id"], y=df["parked"],
        name="Parked Vehicles",
        marker_color="#ef233c",
        opacity=0.7,
    ))
    fig.add_trace(go.Scatter(
        x=df["frame_id"], y=cong_num * df["parked"].max() / 3,
        name="Congestion Level (scaled)",
        line=dict(color="#ffd166", width=2),
        yaxis="y",
    ))
    fig.update_layout(
        title="Parked Vehicles vs Congestion",
        xaxis_title="Frame",
        yaxis_title="Count",
        template="plotly_dark",
        legend=dict(orientation="h"),
        height=350,
    )
    return fig


def chart_lane_blockage(lane_data: dict) -> go.Figure:
    lanes = list(lane_data.keys())
    avgs = [lane_data[l]["avg_blockage_pct"] for l in lanes]
    maxs = [lane_data[l]["max_blockage_pct"] for l in lanes]
    colors = [
        "#06d6a0" if lane_data[l]["status"] == "Clear"
        else "#ffd166" if lane_data[l]["status"] == "Partially Blocked"
        else "#ef233c"
        for l in lanes
    ]
    fig = go.Figure(data=[
        go.Bar(name="Avg Blockage %", x=[f"Lane {l}" for l in lanes],
               y=avgs, marker_color=colors),
        go.Bar(name="Max Blockage %", x=[f"Lane {l}" for l in lanes],
               y=maxs, marker_color=colors, opacity=0.4),
    ])
    fig.update_layout(
        title="Lane Blockage Analysis",
        yaxis_title="Blockage %",
        barmode="overlay",
        template="plotly_dark",
        height=350,
    )
    return fig


def chart_density_trend(timeline: list) -> go.Figure:
    df = pd.DataFrame(timeline)
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=df["frame_id"], y=df["density"],
        fill="tozeroy", line=dict(color="#7209b7", width=2),
        fillcolor="rgba(114,9,183,0.2)",
        name="Vehicle Density",
    ))
    fig.update_layout(
        title="Traffic Density Trend",
        xaxis_title="Frame",
        yaxis_title="Density (veh/1000px²)",
        template="plotly_dark",
        height=300,
    )
    return fig


# ---------------------------------------------------------------------------
# Congestion indicator widget
# ---------------------------------------------------------------------------

def congestion_indicator(level: str, color: str) -> None:
    color_map = {"green": "#06d6a0", "yellow": "#ffd166", "red": "#ef233c"}
    hex_color = color_map.get(color, "#adb5bd")
    st.markdown(
        f"""
        <div style="
            background: {hex_color}22;
            border: 3px solid {hex_color};
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        ">
            <div style="font-size:3em">
                {'🟢' if level=='LOW' else '🟡' if level=='MEDIUM' else '🔴'}
            </div>
            <div style="font-size:1.8em; font-weight:700; color:{hex_color}">
                {level} CONGESTION
            </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

def render_sidebar() -> None:
    with st.sidebar:
        st.image("https://img.icons8.com/fluency/96/traffic-light.png", width=70)
        st.title("🚦 Traffic Analyser")
        st.markdown("---")

        st.subheader("ℹ️ System Info")
        be_ok = check_backend()
        if be_ok:
            st.success("✅ Backend online")
        else:
            st.error("❌ Backend offline\n\nStart with:\n```\nuvicorn backend.main:app --reload\n```")

        st.markdown("---")
        st.subheader("⚙️ Settings")
        st.number_input("Confidence threshold", min_value=0.1, max_value=0.9,
                         value=0.4, step=0.05, key="conf_thresh")
        st.slider("Number of lanes", 2, 6, 3, key="n_lanes")
        st.slider("Min stationary frames", 10, 60, 20, key="min_stationary")

        st.markdown("---")
        st.caption("AI Traffic Parking Impact Analysis v1.0")


# ---------------------------------------------------------------------------
# Main sections
# ---------------------------------------------------------------------------

def section_upload() -> None:
    st.header("📤 Upload Traffic Video")
    uploaded = st.file_uploader(
        "Choose a video file",
        type=["mp4", "avi", "mov", "mkv"],
        help="Supported: MP4, AVI, MOV, MKV",
    )
    if uploaded is None:
        return

    col1, col2 = st.columns([3, 1])
    with col1:
        st.video(uploaded)
    with col2:
        st.metric("Filename", uploaded.name)
        st.metric("Size", f"{uploaded.size / 1024**2:.1f} MB")

        if st.button("🚀 Analyse Video", type="primary", use_container_width=True):
            # Upload the file
            with st.spinner("Uploading video..."):
                resp = api_post(
                    "/upload-video",
                    files={"file": (uploaded.name, uploaded.getvalue(), uploaded.type)},
                )
            if not resp:
                st.error("Upload failed. Is the backend running?")
                return

            job_id = resp["job_id"]
            st.session_state.job_id = job_id
            st.session_state.metrics = None  # clear old results
            st.success(f"✅ Uploaded! Job ID: `{job_id}`")

            # Start processing
            with st.spinner("Starting analysis pipeline..."):
                proc_resp = api_post(
                    "/process-video",
                    json_data={
                        "job_id": job_id,
                        "conf_threshold": st.session_state.get("conf_thresh", 0.4),
                        "n_lanes": st.session_state.get("n_lanes", 3),
                        "min_stationary_frames": st.session_state.get("min_stationary", 40),
                    },
                )
            if not proc_resp:
                st.error("Failed to start processing.")
                return

            st.info("🔄 Video is being analysed. This may take a few minutes...")

    # --- Show progress if a job is running ---
    job_id = st.session_state.get("job_id")
    if job_id and not st.session_state.get("metrics"):
        st.markdown("---")
        st.subheader("⏳ Analysis Progress")

        # Check current status
        status_resp = api_get(f"/job-status/{job_id}")
        if status_resp:
            state = status_resp.get("status", "unknown")

            if state == "completed":
                st.success("✅ Analysis complete!")
                with st.spinner("Loading results..."):
                    load_results(job_id)
                st.balloons()
                st.rerun()

            elif state == "failed":
                st.error(f"❌ Processing failed: {status_resp.get('error', 'Unknown error')}")

            elif state in ("processing", "queued"):
                st.info(f"Status: **{state.upper()}** — processing your video with YOLOv8...")
                prog = st.progress(0.5 if state == "processing" else 0.1)
                st.caption("This page will refresh automatically every 5 seconds.")
                time.sleep(5)
                st.rerun()

            else:
                st.warning(f"Status: {state}")
                time.sleep(3)
                st.rerun()


def section_statistics() -> None:
    metrics = st.session_state.metrics
    cong = st.session_state.congestion
    if not metrics:
        return

    st.header("📊 Traffic Statistics")
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total Vehicles Seen",  metrics["total_vehicles_seen"])
    c2.metric("Avg Moving / Frame",   metrics["avg_moving_vehicles"])
    c3.metric("Avg Parked / Frame",   metrics["avg_parked_vehicles"])
    c4.metric("Avg Speed (px/frame)", metrics["avg_speed_px"])
    c5.metric("Avg Density",          metrics["avg_vehicle_density"])

    st.markdown("")
    if cong:
        congestion_indicator(cong["congestion_level"], cong["color"])
        st.caption(cong.get("description", ""))


def section_graphs() -> None:
    timeline = st.session_state.timeline
    lane_data = st.session_state.lane_blockage
    if not timeline:
        return

    st.header("📈 Traffic Analytics")

    col_l, col_r = st.columns(2)
    with col_l:
        st.plotly_chart(chart_vehicles_over_time(timeline), use_container_width=True)
    with col_r:
        st.plotly_chart(chart_parked_vs_congestion(timeline), use_container_width=True)

    col_l2, col_r2 = st.columns(2)
    with col_l2:
        st.plotly_chart(chart_speed_vs_density(timeline), use_container_width=True)
    with col_r2:
        if lane_data and lane_data.get("lanes"):
            st.plotly_chart(chart_lane_blockage(lane_data["lanes"]), use_container_width=True)

    st.plotly_chart(chart_density_trend(timeline), use_container_width=True)


def section_lanes() -> None:
    lane_data = st.session_state.lane_blockage
    if not lane_data or not lane_data.get("lanes"):
        return

    st.header("🛣️ Lane Blockage Analysis")
    cols = st.columns(len(lane_data["lanes"]))
    status_icon = {"Clear": "✅", "Partially Blocked": "⚠️", "Blocked": "🚫"}
    for col, (lid, info) in zip(cols, lane_data["lanes"].items()):
        icon = status_icon.get(info["status"], "❓")
        col.metric(
            f"{icon} Lane {lid}",
            f"{info['avg_blockage_pct']}% avg",
            f"Max: {info['max_blockage_pct']}%",
        )
        col.caption(info["status"])


def section_violations() -> None:
    viol = st.session_state.violations
    if not viol:
        return

    st.header("🚨 Parking Violation Alerts")
    total = viol.get("total_violations", 0)
    if total == 0:
        st.success("No parking violations detected.")
        return

    st.warning(f"⚠️ {total} parking violation(s) detected")
    df = pd.DataFrame(viol["violations"])
    if not df.empty:
        df.columns = [c.replace("_", " ").title() for c in df.columns]
        st.dataframe(df, use_container_width=True, hide_index=True)


def section_video_download() -> None:
    job_id = st.session_state.job_id
    if job_id and st.session_state.metrics:
        st.header("🎬 Processed Video")
        dl_url = f"{API_BASE}/download-video/{job_id}"
        st.markdown(
            f'<a href="{dl_url}" target="_blank">'
            '<button style="background:#0077b6;color:white;padding:10px 24px;'
            'border:none;border-radius:8px;cursor:pointer;font-size:1em">'
            "⬇️ Download Annotated Video"
            "</button></a>",
            unsafe_allow_html=True,
        )
        st.caption(
            "The annotated video includes bounding boxes, vehicle IDs, "
            "parked/moving labels, and lane blockage overlays."
        )


# ---------------------------------------------------------------------------
# App entry
# ---------------------------------------------------------------------------

def main() -> None:
    render_sidebar()

    st.title("🚗 AI-Based Roadside Parking Impact Analysis on Traffic")
    st.markdown(
        "Upload a traffic video to detect vehicles, identify parked cars, "
        "analyse lane blockage, and quantify congestion impact using YOLOv8 + SORT."
    )

    # Manual refresh button — useful after long processing
    job_id = st.session_state.get("job_id")
    if job_id and not st.session_state.get("metrics"):
        col1, col2 = st.columns([3, 1])
        with col2:
            if st.button("🔄 Check Results", use_container_width=True):
                status_resp = api_get(f"/job-status/{job_id}")
                if status_resp and status_resp.get("status") == "completed":
                    load_results(job_id)
                    st.rerun()
                else:
                    state = status_resp.get("status", "unknown") if status_resp else "unreachable"
                    st.info(f"Still processing... (status: {state})")

    st.markdown("---")

    section_upload()

    if st.session_state.metrics:
        st.markdown("---")
        section_statistics()
        st.markdown("---")
        section_graphs()
        st.markdown("---")
        section_lanes()
        st.markdown("---")
        section_violations()
        st.markdown("---")
        section_video_download()
    else:
        st.info("👆 Upload a traffic video above to begin analysis.")

        # Show feature preview cards
        st.markdown("### What this system does")
        c1, c2, c3 = st.columns(3)
        c1.info("**🔍 Vehicle Detection**\nYOLOv8 detects cars, trucks, buses, bikes in every frame")
        c2.info("**🅿️ Parking Detection**\nTracks stationary vehicles and flags them as parked")
        c3.info("**🛣️ Lane Analysis**\nMeasures how parked vehicles block traffic lanes")
        c4, c5, c6 = st.columns(3)
        c4.info("**📊 Traffic Metrics**\nDensity, speed, congestion level per frame")
        c5.info("**🚨 Violation Alerts**\nFlags vehicles illegally blocking lanes")
        c6.info("**🎬 Annotated Video**\nOutput video with detection overlays")


if __name__ == "__main__":
    main()
