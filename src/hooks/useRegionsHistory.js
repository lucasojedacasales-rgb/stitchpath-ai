import { useRef, useState, useCallback } from 'react';

/**
 * Undo/redo history for the regions array (order, color, visibility, delete,
 * re-vectorization). Snapshots are array references — cheap, since region
 * objects are shared immutably.
 */
export function useRegionsHistory(limit = 40) {
  const undoRef = useRef([]);
  const redoRef = useRef([]);
  const [, setTick] = useState(0);
  const bump = () => setTick(t => t + 1);

  const push = useCallback((snapshot) => {
    if (!Array.isArray(snapshot)) return;
    undoRef.current.push(snapshot);
    if (undoRef.current.length > limit) undoRef.current.shift();
    redoRef.current = [];
    bump();
  }, [limit]);

  const undo = useCallback((current) => {
    if (undoRef.current.length === 0) return null;
    const prev = undoRef.current.pop();
    redoRef.current.push(current);
    bump();
    return prev;
  }, []);

  const redo = useCallback((current) => {
    if (redoRef.current.length === 0) return null;
    const next = redoRef.current.pop();
    undoRef.current.push(current);
    bump();
    return next;
  }, []);

  return {
    push,
    undo,
    redo,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };
}