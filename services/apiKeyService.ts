const STORAGE_KEY = 'gemini_api_key';

export const getApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};

export const setApiKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY, key);
};

export const clearApiKey = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const hasApiKey = (): boolean => {
  const key = getApiKey();
  return key !== null && key.length > 0;
};
