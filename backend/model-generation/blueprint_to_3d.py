import requests
import json
import re
import os

# OpenRouter API key loaded securely from environment
API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
SITE_URL = os.environ.get("SITE_URL", "https://planvista3d.local")
SITE_NAME = "PlanVista3D"

def analyze_blueprint(image_url=None):
    """Analyzes blueprint image using Molmo Vision model and generates structured JSON."""
    if not API_KEY:
        raise ValueError("OPENROUTER_API_KEY environment variable is not configured.")

    target_url = image_url or "https://live.staticflickr.com/3851/14825276609_098cac593d_b.jpg"

    response = requests.post(
        url="https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": SITE_URL,
            "X-Title": SITE_NAME,
        },
        json={
            "model": os.environ.get("MODEL_NAME", "allenai/molmo-2-8b:free"),
            "messages": [{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": """Analyze this architectural blueprint as a floor plan. Extract precise structured data in VALID JSON format only:

{
  "image_width": 1024,
  "image_height": 768,
  "scale_factor": 0.1,
  "wall_height": 3.0,
  "walls": [
    {
      "id": "wall1", 
      "vertices": [[0.1,0.9],[0.2,0.9],[0.2,0.8],[0.1,0.8]],
      "thickness": 0.05
    }
  ],
  "doors": [
    {
      "id": "door1",
      "center": [0.15,0.85],
      "width": 0.08,
      "height": 2.1
    }
  ],
  "windows": [
    {
      "id": "win1",
      "center": [0.5,0.7],
      "width": 1.2,
      "height": 1.0
    }
  ],
  "rooms": [
    {
      "bounds": {
        "x": 0.1,
        "y": 0.8,
        "width": 0.3,
        "height": 0.4
      }
    }
  ]
}

Rules:
- Coordinates: 0-1 normalized (x: left→right, y: top→bottom)
- Walls: closed polygon loops (≥3 vertices from blueprint lines)
- Doors/Windows: rectangle centers + dimensions (in normalized units)
- Scale: assume 1 unit ≈ 10m real-world
- Output ONLY valid JSON, no explanations!"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": target_url
                        }
                    }
                ]
            }],
            "temperature": 0.1,
            "max_tokens": 4000
        },
        timeout=60
    )

    if response.status_code != 200:
        raise Exception(f"API Error: {response.status_code} - {response.text}")

    content = response.json()["choices"][0]["message"]["content"]
    json_match = re.search(r'\{[\s\S]*\}', content)
    if not json_match:
        raise Exception("No valid JSON found in response")

    analysis_data = json.loads(json_match.group())

    output_json = "floorplan_analysis.json"
    with open(output_json, "w") as f:
        json.dump(analysis_data, f, indent=2)

    print(f"✅ Analysis saved: {output_json}")
    return output_json

def generate_3d_model(analysis_file, output_glb="building.glb"):
    """Runs Blender script with analysis data"""
    import subprocess
    cmd = [
        "blender", "--background",
        "--python", "generate_model_image.py",
        "--", analysis_file, output_glb
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✅ 3D Model generated: {output_glb}")
    else:
        print(f"❌ Blender error: {result.stderr}")
    return output_glb

if __name__ == "__main__":
    try:
        analysis_file = analyze_blueprint()
        model_file = generate_3d_model(analysis_file)
        print(f"🎉 Complete! Files: {analysis_file}, {model_file}")
    except Exception as e:
        print(f"Error: {e}")
