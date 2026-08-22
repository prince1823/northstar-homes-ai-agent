const CONVERSATIONS_KEY = "huvo_conversations";
const HISTORY_PREFIX = "huvo_history_";
const SETTINGS_KEY = "huvo_settings";

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function loadConversations() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveConversations(list) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list));
}

export function upsertConversation(entry) {
  const list = loadConversations();
  const i = list.findIndex((c) => c.id === entry.id);
  if (i >= 0) {
    list[i] = { ...list[i], ...entry };
  } else {
    list.unshift({ ended: false, analytics: null, updatedAt: Date.now(), ...entry });
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  saveConversations(list);
  return list;
}

export function deleteConversation(id) {
  const list = loadConversations().filter((c) => c.id !== id);
  saveConversations(list);
  localStorage.removeItem(HISTORY_PREFIX + id);
  return list;
}

export function loadHistory(id) {
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + id);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(id, messages) {
  localStorage.setItem(HISTORY_PREFIX + id, JSON.stringify(messages));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { apiKey: "", model: DEFAULT_MODEL };
  } catch {
    return { apiKey: "", model: DEFAULT_MODEL };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
