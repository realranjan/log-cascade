import { useState, useEffect, useCallback } from 'react'
import { checkApi, getModelVersions, predictSingle, predictBatch } from './api'
import './App.css'


function getLabelClass(label) {
  const l = String(label).toLowerCase()
  if (l.includes('security')) return 'lbl-security'
  if (l.includes('critical') || l.includes('error')) return 'lbl-critical'
  if (l.includes('system')) return 'lbl-system'
  if (l.includes('user')) return 'lbl-user'
  if (l.includes('http')) return 'lbl-http'
  return 'lbl-unclass'
}

function parseCSV(text) {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const values = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    return values
  })
  return { headers, rows }
}

function computeDistribution(predictions) {
  const counts = {}
  predictions.forEach(p => {
    const label = p.predicted_label
    counts[label] = (counts[label] || 0) + 1
  })
  return counts
}

// ─── Single Prediction Tab ───────────────────────────────────────────────────
function SinglePredictionTab({ apiOk, versions, selectedVersion, busy, setBusy, onRetry }) {
  const [logMessage, setLogMessage] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handlePredict = async () => {
    if (!logMessage.trim()) { setError('Please enter a log message.'); return }
    if (!versions.length) { setError('No models available. Please train a model first.'); return }
    setError(null)
    setResult(null)
    setBusy('predicting')
    try {
      const res = await predictSingle(logMessage, selectedVersion)
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!apiOk) return <div className="tab-warning">Connecting to backend... <button className="btn btn-secondary" onClick={onRetry}>Retry</button></div>

  return (
    <div className="tab-content">
      <h2>Enter Log Details</h2>
      <div className="form-group">
        <label className="field-label">Log Message</label>
        <textarea
          className="textarea-field"
          placeholder="e.g. Email service experiencing issues with sending..."
          value={logMessage}
          onChange={e => setLogMessage(e.target.value)}
          rows={3}
        />
      </div>

      <button
        className="btn btn-primary full-width"
        disabled={busy}
        onClick={handlePredict}
      >
        {busy === 'predicting' ? 'Classifying...' : 'Classify Log'}
      </button>

      {error && <div className="error-box">{error}</div>}

      {result && (
        <>
          <hr />
          <h2>Prediction Result</h2>
          <div className="result-card">
            <div className="result-info">
              <div><strong>Message:</strong> <em>{result.log_message}</em></div>
            </div>
            <div className="result-label">
              <span className={`label-badge ${getLabelClass(result.predicted_label)}`}>
                {result.predicted_label}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Batch Prediction Tab ────────────────────────────────────────────────────
function BatchPredictionTab({ apiOk, versions, selectedVersion, busy, setBusy, onRetry }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [predictions, setPredictions] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    setFile(f || null)
    setPredictions(null)
    setError(null)
    if (f) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const parsed = parseCSV(ev.target.result)
        setPreview(parsed)
      }
      reader.readAsText(f)
    } else {
      setPreview(null)
    }
  }

  const handleBatchPredict = async () => {
    if (!file) return
    if (!versions.length) { setError('No models available. Please train a model first.'); return }
    setError(null)
    setPredictions(null)
    setBusy('batching')
    try {
      const res = await predictBatch(file, selectedVersion)
      setPredictions(res.predictions)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const handleDownload = () => {
    if (!predictions) return
    const headers = Object.keys(predictions[0])
    const csv = [
      headers.join(','),
      ...predictions.map(row => headers.map(h => {
        const val = String(row[h] ?? '')
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(','))
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'classified_logs.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!apiOk) return <div className="tab-warning">Connecting to backend... <button className="btn btn-secondary" onClick={onRetry}>Retry</button></div>

  const distribution = predictions ? computeDistribution(predictions) : null
  const maxCount = distribution ? Math.max(...Object.values(distribution)) : 0

  return (
    <div className="tab-content">
      <h2>Upload Log CSV</h2>
      <p className="info-box">CSV must contain a <strong>log_message</strong> column</p>

      <input type="file" accept=".csv" onChange={handleFileChange} className="file-input" />

      {preview && (
        <div className="preview-section">
          <p><strong>Loaded {preview.rows.length} logs</strong></p>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            className="btn btn-primary full-width"
            disabled={busy}
            onClick={handleBatchPredict}
          >
            {busy === 'batching' ? `Classifying ${preview.rows.length} logs...` : 'Classify All Logs'}
          </button>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      {predictions && (
        <>
          <hr />
          <h2>Results Summary</h2>

          {/* Bar chart */}
          <div className="bar-chart">
            {Object.entries(distribution).sort((a, b) => b[1] - a[1]).map(([label, count]) => (
              <div key={label} className="bar-row">
                <span className="bar-label">{label}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${getLabelClass(label)}-bg`}
                    style={{ width: `${(count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="bar-count">{count}</span>
              </div>
            ))}
          </div>

          <h2>Detailed Predictions</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>{Object.keys(predictions[0]).map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {predictions.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(row).map(([key, val], j) => (
                      <td key={j}>
                        {key === 'predicted_label'
                          ? <span className={`label-badge ${getLabelClass(val)}`}>{val}</span>
                          : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn-primary full-width" onClick={handleDownload}>
            Download Classified Logs CSV
          </button>
        </>
      )}
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────
function App() {
  const [apiOk, setApiOk] = useState(false)
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState('main')
  const [activeTab, setActiveTab] = useState(0)
  const [busy, setBusy] = useState(null) // 'training' | 'predicting' | 'batching' | null

  const [loading, setLoading] = useState(true)

  const connectApi = useCallback(async () => {
    setLoading(true)
    const { ok } = await checkApi()
    setApiOk(ok)
    if (ok) {
      const v = await getModelVersions()
      setVersions(v)
      if (v.length > 0) setSelectedVersion(v[v.length - 1])
    }
    setLoading(false)
  }, [])

  // Fetching on mount is the point here: this effect syncs React with an
  // external system (the backend). The rule cannot tell that apart from a
  // render-loop, so it is silenced for this line only.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { connectApi() }, [connectApi])

  const tabs = [
    { label: 'Single Prediction', id: 'single' },
    { label: 'Batch Prediction', id: 'batch' },
  ]

  return (
    <div className="app-layout">
      <main className="main-content">
        <header className="app-header">
          <h1>LogCascade AI</h1>
          <p className="subtitle" style={{ marginBottom: '16px' }}>High-throughput cascading log classification engine powered by Regex, Google Embeddings, and Gemini LLM</p>
          {loading && <p className="hint">Connecting to backend (may take ~30s on cold start)...</p>}
          {!loading && apiOk && <div className="status-pill status-ok" style={{ display: 'inline-block', marginTop: '12px' }}>API Connected</div>}
          {!loading && !apiOk && <div className="status-pill status-err" style={{ display: 'inline-block', cursor: 'pointer' }} onClick={connectApi}>API Offline — click to retry</div>}
        </header>
        <hr />

        <div className="tabs">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 0 && (
          <SinglePredictionTab apiOk={apiOk} versions={versions} selectedVersion={selectedVersion} busy={busy} setBusy={setBusy} onRetry={connectApi} />
        )}
        {activeTab === 1 && (
          <BatchPredictionTab apiOk={apiOk} versions={versions} selectedVersion={selectedVersion} busy={busy} setBusy={setBusy} onRetry={connectApi} />
        )}
      </main>
    </div>
  )
}

export default App
