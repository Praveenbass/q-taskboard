import json
import os
import subprocess


def export_tasks(tasks):
    payload = json.dumps({"tasks": tasks})

    result = subprocess.run(
        [
            "node",
            "/app/projects/node/airtable-export.js",
            payload,
        ],
        capture_output=True,
        text=True,
        timeout=120,
        env=os.environ.copy(),
    )

    if result.returncode != 0:
        raise RuntimeError("Airtable export failed")

    return json.loads(result.stdout)