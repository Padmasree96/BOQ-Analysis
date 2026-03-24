/**
 * usePersistedExtraction
 * Persists BOQ/CAD extraction results to sessionStorage so they survive
 * tab switches and navigation until the user explicitly resets or the
 * browser session ends.
 */
import { useState, useCallback, useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'flyyai.extraction.';

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(key, value) {
  try {
    if (value == null) {
      sessionStorage.removeItem(STORAGE_PREFIX + key);
    } else {
      sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    }
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

/**
 * Hook that wraps useState with sessionStorage persistence.
 * @param {string} key - unique key for this piece of state
 * @param {*} initialValue - fallback when nothing is stored
 * @returns {[any, Function, Function]} [value, setValue, clearValue]
 */
export function useSessionState(key, initialValue = null) {
  const [state, setState] = useState(() => {
    const stored = readSession(key);
    return stored !== null ? stored : initialValue;
  });

  const isFirstRender = useRef(true);

  useEffect(() => {
    // Don't write on first render (we just read)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    writeSession(key, state);
  }, [key, state]);

  const clear = useCallback(() => {
    writeSession(key, null);
    setState(initialValue);
  }, [key, initialValue]);

  return [state, setState, clear];
}

/**
 * Clear all extraction data from sessionStorage.
 * Call this on explicit "New Upload" / reset actions.
 */
export function clearAllExtractionData() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
}
