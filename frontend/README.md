# LogCascade — Frontend Dashboard

Interactive React + Vite dashboard for **LogCascade**, an intelligent 3-tier cascading log classification engine.

## Features
- **Single Log Triage**: Test individual log messages with live response latency and confidence level.
- **Batch CSV Analysis**: Drag-and-drop CSV logs with automatic multi-class distribution graphs.
- **Dynamic Version Selector**: Switch between model checkpoint tags from Hugging Face Hub.
- **Export Capabilities**: Download classified CSVs with predicted labels.

## Quick Start
```bash
npm install
npm run dev
```
Runs at `http://localhost:5173`. Connects to FastAPI backend at `http://localhost:8000`.
