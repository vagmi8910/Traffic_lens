"""
analytics_explainer.py
-----------------------
Uses Groq LLM (llama3-8b-8192) to generate bullet-point explanations
for each traffic graph and visualization.
"""

import os
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

def _get_groq_client():
    try:
        from groq import Groq
        api_key = os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            logger.warning("GROQ_API_KEY not set — AI explanations unavailable.")
            return None
        return Groq(api_key=api_key)
    except ImportError:
        logger.warning("groq package not installed. Run: pip install groq")
        return None


BULLET_INSTRUCTION = """
Respond ONLY with a clean bullet point list. Use this exact format:
• [point 1]
• [point 2]
• [point 3]
...and so on.

Rules:
- Every single line must start with •
- Do NOT write any paragraph text, intro sentences, or conclusions
- Do NOT use numbered lists, dashes, or asterisks — only •
- Each bullet must be one clear, concise sentence
- Write between 7 and 10 bullet points
- Use simple everyday English
"""

PROMPTS = {

    "vehicles_time": """You are a traffic analyst. Analyse the following data from a "Vehicles vs Time" graph and explain it in bullet points.

Data:
- Vehicle counts over time: {vehicle_counts}
- Time points: {timestamps}
- Average moving vehicles: {avg_moving}
- Average parked vehicles: {avg_parked}
- Congestion level: {congestion_level}

Cover these topics in your bullet points:
- What the graph is tracking
- Whether vehicle count went up, down, or fluctuated
- What the moving vs parked split tells us
- How parked vehicles affect traffic flow
- What the congestion level means for drivers
- An overall conclusion about the traffic situation

{bullet_instruction}""",

    "parked_congestion": """You are a traffic analyst. Analyse the following data from a "Parked Vehicles vs Congestion" graph and explain it in bullet points.

Data:
- Parked vehicle counts: {parked_counts}
- Congestion levels: {congestion_levels}
- Peak parked vehicles: {peak_parked}
- Dominant congestion level: {dominant_congestion}
- Lane blockage: {lane_blockage}

Cover these topics in your bullet points:
- What this graph compares
- Whether more parking leads to more congestion
- When the worst congestion occurred
- How parked vehicles reduce usable road space
- Impact on drivers trying to pass
- Practical recommendation based on this data

{bullet_instruction}""",

    "speed_density": """You are a traffic analyst. Analyse the following data from a "Speed vs Traffic Density" scatter plot and explain it in bullet points.

Data:
- Average vehicle speed: {avg_speed} pixels/frame
- Average road density: {avg_density}
- Speed at low density: {speed_low_density}
- Speed at high density: {speed_high_density}
- Congestion level: {congestion_level}

Cover these topics in your bullet points:
- What the scatter plot is showing
- How speed changes as density increases
- The difference between low-density and high-density speeds
- How parked vehicles worsen road density
- What the green/yellow/red colour coding means
- What this means for drivers in real terms

{bullet_instruction}""",

    "lane_blockage": """You are a traffic analyst. Analyse the following lane blockage data and explain it in bullet points.

Data:
- Blockage per lane: {lane_blockage}
- Total lanes analysed: {num_lanes}
- Most blocked lane: {most_blocked_lane} at {max_blockage}%
- Violations detected: {violations}

Cover these topics in your bullet points:
- What lane blockage percentage means
- Which lane is worst affected and by how much
- What happens when a lane is heavily blocked
- How this forces drivers to merge and slow down
- Whether the blockage levels are dangerous or manageable
- What actions could reduce the blockage

{bullet_instruction}""",

    "density_trend": """You are a traffic analyst. Analyse the following traffic density trend data and explain it in bullet points.

Data:
- Density values over time: {density_values}
- Peak density recorded: {peak_density}
- Average density: {avg_density}
- Frames analysed: {frames_analysed}
- Congestion level: {congestion_level}

Cover these topics in your bullet points:
- What vehicle density measures
- Whether density was rising, falling, or steady
- When peak density occurred and what it means
- How parked vehicles contribute to higher density
- What high density feels like for drivers
- What the trend suggests about this road's congestion pattern

{bullet_instruction}""",

    "heatmap_traffic": """You are a traffic analyst. Explain a traffic density heatmap in bullet points.

Data:
- Congestion level: {congestion_level}
- Average moving vehicles: {avg_moving}
- Average vehicle density: {avg_density}

Cover these topics in your bullet points:
- What a traffic density heatmap shows
- What red/orange zones mean
- What green/cool zones mean
- Why traffic concentrates in narrow bright zones
- How parked vehicles cause uneven traffic distribution
- What this heatmap reveals about road usage patterns

{bullet_instruction}""",

    "heatmap_parking": """You are a traffic analyst. Explain a parking hotspot heatmap in bullet points.

Data:
- Congestion level: {congestion_level}
- Average parked vehicles: {avg_parked}
- Violations detected: {violations}

Cover these topics in your bullet points:
- What a parking hotspot heatmap shows
- What red/orange hotspot zones indicate
- What green zones mean
- Why clustered hotspots are dangerous
- How repeated parking in the same spots creates bottlenecks
- Where enforcement or design changes would help most

{bullet_instruction}""",
}


FALLBACKS = {
    "vehicles_time": """• This graph tracks how many vehicles were on the road at different points during the recorded video
• The blue area represents all vehicles detected, the green line shows moving vehicles, and the red area shows parked vehicles
• When the red area increases, more vehicles are stopped on the roadside, reducing available lane space
• Parked vehicles force moving traffic into fewer lanes, causing slowdowns and lane-change manoeuvres
• A higher overall vehicle count combined with high parking activity typically leads to increased congestion
• The congestion level shown reflects the combined effect of vehicle volume and road blockage
• Monitoring this trend helps identify peak periods when parking enforcement would be most effective""",

    "parked_congestion": """• This graph compares the number of parked vehicles to the congestion level at each moment in the video
• When parked vehicle counts are high, congestion tends to increase because road space is reduced
• Peak parked vehicle counts represent the moments when road capacity was most constrained
• Each parked vehicle effectively narrows the road, forcing moving vehicles to slow down or merge
• Drivers must repeatedly brake, steer around parked cars, and re-merge — increasing travel time
• The dominant congestion level reflects the overall traffic difficulty during the observation period
• Reducing roadside parking during peak hours would directly improve traffic flow on this road""",

    "speed_density": """• This scatter plot shows the relationship between how crowded the road is and how fast vehicles move
• Each dot represents one moment in time — its position shows both road density and vehicle speed
• As road density increases, vehicle speed typically decreases — more vehicles means less room to move freely
• Vehicles move faster when the road is less crowded and slower when more vehicles are competing for space
• Parked vehicles worsen density even without adding to moving traffic by blocking part of the road
• Green dots represent low-congestion moments, yellow dots medium congestion, and red dots high congestion
• Understanding this relationship helps predict how additional parking restrictions could improve speeds""",

    "lane_blockage": """• This chart shows what percentage of each traffic lane is blocked by parked vehicles
• The blue bars show average blockage across the full observation period for each lane
• The orange bars show the peak blockage — the worst single moment recorded in each lane
• A lane that is 30% blocked means nearly a third of that lane's width is occupied by parked vehicles
• Heavily blocked lanes force drivers to slow down sharply or merge suddenly into adjacent lanes
• Sudden lane changes caused by parked vehicles increase the risk of collisions and near-misses
• Lanes with consistently high blockage percentages are strong candidates for parking enforcement action""",

    "density_trend": """• This chart tracks how crowded the road was at every moment throughout the recorded video
• Vehicle density measures how many vehicles are competing for the available road space at any time
• When the purple area rises, the road became more crowded; when it falls, traffic eased
• Peaks in the chart represent the most difficult moments — heaviest traffic and slowest speeds
• Parked vehicles contribute directly to higher density by reducing the effective road width
• A consistently high density trend suggests this road regularly operates near its traffic capacity
• Identifying peak density periods helps road planners schedule enforcement and management interventions""",

    "heatmap_traffic": """• This heatmap shows where vehicles appeared most frequently throughout the recorded video
• Bright red and orange zones are where vehicles were almost constantly present — the busiest areas
• Green and cooler-coloured zones had fewer vehicles, indicating lighter traffic activity in those spots
• Traffic concentrating into narrow bright zones often means parked vehicles are blocking other areas
• When all moving traffic is forced into fewer lanes, those lanes show extreme heat on the map
• Uneven heat distribution across the road width is a strong indicator of lane blockage by parking
• This heatmap pinpoints exactly where road capacity improvements or enforcement would be most effective""",

    "heatmap_parking": """• This heatmap shows where vehicles repeatedly parked during the entire observation period
• Bright red and orange zones are the most serious hotspots — parking was frequent and prolonged here
• Green zones indicate areas where little or no parking activity was detected
• Red hotspot zones near active traffic lanes create repeated bottlenecks for passing drivers
• Vehicles parked in the same locations repeatedly force moving traffic to slow down at those exact spots
• Clustered hotspots can turn a road into a series of chokepoints even when overall traffic volume is moderate
• These specific hotspot locations are the highest-priority areas for parking enforcement or road design changes""",
}


class AnalyticsExplainer:

    def __init__(self):
        self._client = None

    def _client_ready(self):
        if self._client is None:
            self._client = _get_groq_client()
        return self._client is not None

    def _call_groq(self, prompt: str) -> str:
        try:
            response = self._client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a traffic analyst. You ALWAYS respond using bullet points only. "
                            "Every line of your response MUST start with the • character. "
                            "Never write paragraphs. Never write introductions or conclusions as prose. "
                            "Only bullet points, each starting with •."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=900,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:
            logger.error("Groq API call failed: %s", exc)
            return ""

    def explain(self, graph_type: str, data: Dict[str, Any]) -> str:
        template = PROMPTS.get(graph_type)
        fallback = FALLBACKS.get(graph_type, "No explanation available.")

        if template is None:
            return fallback

        try:
            data["bullet_instruction"] = BULLET_INSTRUCTION
            prompt = template.format_map(_SafeFormat(data))
        except Exception as exc:
            logger.warning("Prompt formatting error: %s", exc)
            return fallback

        if not self._client_ready():
            return fallback

        result = self._call_groq(prompt)
        return result if result else fallback


class _SafeFormat(dict):
    def __missing__(self, key):
        return "N/A"


explainer = AnalyticsExplainer()