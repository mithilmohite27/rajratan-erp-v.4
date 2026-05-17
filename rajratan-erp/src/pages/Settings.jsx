import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import { CONFIG_LABELS } from '../lib/config.js'
import { saveConfig } from '../lib/sheets.js'

export default function Settings() {
  const { accessToken, config, setConfig } = useApp()
  const [local, setLocal]   = useState({ ...config })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')

  const handleChange = (key, val) => {
    setLocal(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await saveConfig(accessToken, local)
      setConfig(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      setError('Save failed: ' + e.message)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 sticky top-12 z-10">
        <h1 className="text-lg font-bold text-gray-800">⚙️ Settings</h1>
        <p className="text-xs text-gray-400">Override default values used in all calculations</p>
      </div>

      <div className="p-4 space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
          💡 These values are saved to your Google Sheet. All calculations use these numbers automatically.
        </div>

        {Object.entries(CONFIG_LABELS).map(([key, label]) => (
          <div key={key} className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="text-xs text-gray-500 block mb-1">{label}</label>
            <input
              type="number"
              value={local[key] ?? ''}
              onChange={e => handleChange(key, parseFloat(e.target.value))}
              inputMode="decimal"
              className="w-full text-lg font-bold text-gray-800 outline-none bg-transparent"
            />
          </div>
        ))}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">{error}</div>
        )}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-600 text-sm rounded-xl p-3 text-center">
            ✅ Settings saved to Google Sheets!
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-500 disabled:bg-orange-300 text-white font-bold py-4 rounded-xl text-lg"
        >
          {saving ? '⏳ Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  )
}
