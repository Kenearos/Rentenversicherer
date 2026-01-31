import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getApiKey, setApiKey, clearApiKey, hasApiKey } from '../../services/apiKeyService';

describe('apiKeyService', () => {
  const STORAGE_KEY = 'gemini_api_key';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getApiKey', () => {
    it('should return null when no key is stored', () => {
      const result = getApiKey();
      expect(result).toBeNull();
    });

    it('should return the stored API key', () => {
      localStorage.setItem(STORAGE_KEY, 'AItest123');

      const result = getApiKey();

      expect(result).toBe('AItest123');
    });

    it('should return empty string if empty string was stored', () => {
      localStorage.setItem(STORAGE_KEY, '');

      const result = getApiKey();

      expect(result).toBe('');
    });
  });

  describe('setApiKey', () => {
    it('should store the API key in localStorage', () => {
      setApiKey('AItest456');

      expect(localStorage.getItem(STORAGE_KEY)).toBe('AItest456');
    });

    it('should overwrite existing key', () => {
      localStorage.setItem(STORAGE_KEY, 'AIold');

      setApiKey('AInew');

      expect(localStorage.getItem(STORAGE_KEY)).toBe('AInew');
    });

    it('should allow storing empty string', () => {
      setApiKey('');

      expect(localStorage.getItem(STORAGE_KEY)).toBe('');
    });
  });

  describe('clearApiKey', () => {
    it('should remove the API key from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, 'AItest');

      clearApiKey();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('should not throw when no key exists', () => {
      expect(() => clearApiKey()).not.toThrow();
    });
  });

  describe('hasApiKey', () => {
    it('should return false when no key is stored', () => {
      const result = hasApiKey();

      expect(result).toBe(false);
    });

    it('should return false when empty string is stored', () => {
      localStorage.setItem(STORAGE_KEY, '');

      const result = hasApiKey();

      expect(result).toBe(false);
    });

    it('should return true when a non-empty key is stored', () => {
      localStorage.setItem(STORAGE_KEY, 'AItest789');

      const result = hasApiKey();

      expect(result).toBe(true);
    });

    it('should return true for single character key', () => {
      localStorage.setItem(STORAGE_KEY, 'A');

      const result = hasApiKey();

      expect(result).toBe(true);
    });
  });

  describe('integration', () => {
    it('should work correctly with set and get', () => {
      setApiKey('AIintegration');

      expect(getApiKey()).toBe('AIintegration');
      expect(hasApiKey()).toBe(true);
    });

    it('should work correctly with set, clear, and get', () => {
      setApiKey('AItest');
      expect(hasApiKey()).toBe(true);

      clearApiKey();

      expect(getApiKey()).toBeNull();
      expect(hasApiKey()).toBe(false);
    });
  });
});
