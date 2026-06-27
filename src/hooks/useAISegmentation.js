import { useState, useCallback } from 'react';

const API_URL = '/api/ai-segment/analyze';

export function useAISegmentation() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const analyze = useCallback(async (imageBase64, concepts = null) => {
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          concepts: concepts || ['nose', 'eye', 'body', 'mouth', 'head']
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Error en análisis');
      }

      setResult(data);
      return data;

    } catch (err) {
      setError(err.message);
      console.error('[useAISegmentation] Error:', err);
      return null;
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { analyze, analyzing, result, error, reset };
}
