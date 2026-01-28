import React, { useState } from 'react';
import { Key, ExternalLink, X } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: (key: string) => void;
  onClose?: () => void;
  currentKey?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSave, onClose, currentKey }) => {
  const [apiKey, setApiKey] = useState(currentKey || '');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('Bitte gib einen API Key ein');
      return;
    }
    if (!apiKey.startsWith('AI')) {
      setError('Der Key sollte mit "AI" beginnen');
      return;
    }
    onSave(apiKey.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Key className="w-5 h-5 text-white" />
            <h2 className="text-lg font-bold text-white">Gemini API Key</h2>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-slate-600 text-sm">
            Dein API Key wird nur lokal in deinem Browser gespeichert und nie an unsere Server gesendet.
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError(''); }}
              placeholder="AIza..."
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-sm text-indigo-600 hover:text-indigo-700"
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            API Key bei Google AI Studio holen
          </a>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
          >
            Speichern
          </button>
        </form>
      </div>
    </div>
  );
};
