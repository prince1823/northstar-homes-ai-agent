import { useState } from "react";
import { DEFAULT_MODEL } from "../lib/storage";

const PRESET_MODELS = [
  { value: "openai/gpt-4o-mini", label: "GPT-4o mini (fast, default)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { value: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash" },
];

export default function SettingsModal({ settings, onSave, onClose }) {
  const [apiKey, setApiKey] = useState(settings.apiKey || "");
  const initialIsCustom = !PRESET_MODELS.some((p) => p.value === settings.model);
  const [isCustom, setIsCustom] = useState(initialIsCustom);
  const [model, setModel] = useState(settings.model || DEFAULT_MODEL);

  function handleModelSelect(e) {
    const v = e.target.value;
    if (v === "__custom__") {
      setIsCustom(true);
      setModel("");
    } else {
      setIsCustom(false);
      setModel(v);
    }
  }

  function handleSave() {
    onSave({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
    onClose();
  }

  function handleClearKey() {
    setApiKey("");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-field">
          <label htmlFor="api-key">OpenRouter API key</label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            placeholder="sk-or-v1-… (leave empty to use the server default, if configured)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <div className="settings-hint">
            Stored only in your browser (localStorage) and sent directly to this
            app's backend for your requests, which forwards it to OpenRouter. It
            is never saved server-side. Get a key at{" "}
            <span className="settings-link">openrouter.ai/keys</span>.
          </div>
          {apiKey && (
            <button className="btn ghost small" onClick={handleClearKey}>
              Clear key
            </button>
          )}
        </div>

        <div className="settings-field">
          <label htmlFor="model-select">Model</label>
          <select id="model-select" value={isCustom ? "__custom__" : model} onChange={handleModelSelect}>
            {PRESET_MODELS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value="__custom__">Custom model…</option>
          </select>
          {isCustom && (
            <input
              className="settings-custom-model"
              type="text"
              placeholder="e.g. mistralai/mistral-large"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          )}
          <div className="settings-hint">Any model slug available on OpenRouter.</div>
        </div>

        <button className="btn primary full-width" onClick={handleSave}>
          Save settings
        </button>
      </div>
    </div>
  );
}
