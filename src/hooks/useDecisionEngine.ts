// base44/src/hooks/useDecisionEngine.ts
import { useState, useCallback } from 'react';
import { analyzeImage, loadImage } from '../../functions/decisionEngine/analyzeImage';
import { DecisionResult } from '../../entities/DecisionResult';

interface UseDecisionEngineReturn {
  decision: DecisionResult | null;
  isAnalyzing: boolean;
  error: string | null;
  analyze: (imageSource: File | string | HTMLImageElement) => Promise<void>;
  reset: () => void;
}

export function useDecisionEngine(): UseDecisionEngineReturn {
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (imageSource: File | string | HTMLImageElement) => {
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const result = await analyzeImage(imageSource);
      setDecision(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error analyzing image');
      setDecision(null);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDecision(null);
    setError(null);
    setIsAnalyzing(false);
  }, []);

  return { decision, isAnalyzing, error, analyze, reset };
}
