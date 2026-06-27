// src/hooks/useDecisionEngine.ts
import { useState, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { analyzeImage } from '../../base44/functions/decisionEngine/analyzeImage';
import type { DecisionResult, ProcessingStrategy } from '../../base44/entities/DecisionResult';

export type AnalysisStatus = 'idle' | 'analyzing' | 'vectorizing' | 'complete' | 'error';

export interface VectorizeResult {
  regions: Array<{
    id: string;
    color: string;
    type: string;
    path_points: number[][];
    stitches: number[][];
    contour_stitches: number[][];
    is_external_border: boolean;
    stitch_count: number;
    area_mm2: number;
    perimeter_mm: number;
    centroid: number[];
    coverage: number;
  }>;
  metadata: {
    totalRegions: number;
    processingTimeMs: number;
  };
}

export interface UseDecisionEngineReturn {
  status: AnalysisStatus;
  result: DecisionResult | null;
  vectorizeResult: VectorizeResult | null;
  error: string | null;
  progress: number;
  isLoading: boolean;
  hasWarnings: boolean;
  warnings: string[];
  analyze: (imageSource: File | string | HTMLImageElement) => Promise<DecisionResult | null>;
  vectorize: (imageUrl: string, strategy?: ProcessingStrategy, config?: Record<string, any>) => Promise<VectorizeResult | null>;
  reset: () => void;
}

export function useDecisionEngine(): UseDecisionEngineReturn {
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [vectorizeResult, setVectorizeResult] = useState<VectorizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setStatus('idle');
    setResult(null);
    setVectorizeResult(null);
    setError(null);
    setProgress(0);
  }, []);

  const analyze = useCallback(async (imageSource: File | string | HTMLImageElement): Promise<DecisionResult | null> => {
    reset();
    abortControllerRef.current = new AbortController();

    try {
      setStatus('analyzing');
      setProgress(15);

      const decisionResult = await analyzeImage(imageSource);

      if (abortControllerRef.current.signal.aborted) return null;

      setResult(decisionResult);
      setProgress(50);
      setStatus('complete');
      return decisionResult;

    } catch (err) {
      if (abortControllerRef.current.signal.aborted) return null;
      const msg = err instanceof Error ? err.message : 'Error desconocido en análisis';
      setError(msg);
      setStatus('error');
      return null;
    }
  }, [reset]);

  const vectorize = useCallback(async (
    imageUrl: string,
    strategy?: ProcessingStrategy,
    existingConfig?: Record<string, any>
  ): Promise<VectorizeResult | null> => {
    abortControllerRef.current = new AbortController();

    try {
      setStatus('vectorizing');
      setProgress(60);

      const aiParams = strategy ? mapStrategyToParams(strategy) : {};
      setProgress(75);

      // Llamar a hybridDigitize con parámetros optimizados
      const res = await base44.functions.invoke('hybridDigitize', {
        image_url: imageUrl,
        mode: existingConfig?.mode || aiParams.mode || 'hybrid',
        width_mm: existingConfig?.width_mm || 100,
        height_mm: existingConfig?.height_mm || 100,
        color_count: aiParams.color_count || existingConfig?.color_count || 6,
        remove_bg: existingConfig?.remove_bg || false,
        use_ia_vision: true,
        use_full_bg: existingConfig?.use_full_bg || false,
        tatami_density: aiParams.tatami_density || existingConfig?.tatami_density || 0.4,
        fill_angle: existingConfig?.fill_angle !== undefined ? existingConfig.fill_angle : null,
      });

      // Verificar respuesta de Base44
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Error en vectorización');
      }

      // Normalizar datos al formato VectorizeResult
      const rawData = res.data.data?.response || res.data.data;

      const normalized: VectorizeResult = {
        regions: (rawData.regions || []).map((r: any) => ({
          id: r.id || `region_${Math.random().toString(36).slice(2, 8)}`,
          color: r.color || '#000000',
          type: r.stitch_type || r.type || 'fill',
          path_points: r.path_points || [],
          stitches: r.stitches || [],
          contour_stitches: r.contour_stitches || [],
          is_external_border: r.is_external_border || false,
          stitch_count: r.stitch_count || 0,
          area_mm2: r.area_mm2 || 0,
          perimeter_mm: r.perimeter_mm || 0,
          centroid: r.centroid || [0, 0],
          coverage: r.coverage || 0,
        })),
        metadata: {
          totalRegions: rawData.regions?.length || 0,
          processingTimeMs: rawData.processingTimeMs || 0,
        },
      };

      if (abortControllerRef.current.signal.aborted) return null;

      setVectorizeResult(normalized);
      setProgress(100);
      setStatus('complete');
      return normalized;

    } catch (err) {
      if (abortControllerRef.current.signal.aborted) return null;
      const msg = err instanceof Error ? err.message : 'Error desconocido en vectorización';
      setError(msg);
      setStatus('error');
      return null;
    }
  }, []);

  const isLoading = status === 'analyzing' || status === 'vectorizing';
  const hasWarnings = (result?.warnings.length ?? 0) > 0;
  const warnings = result?.warnings ?? [];

  return {
    status,
    result,
    vectorizeResult,
    error,
    progress,
    isLoading,
    hasWarnings,
    warnings,
    analyze,
    vectorize,
    reset,
  };
}

function mapStrategyToParams(strategy: ProcessingStrategy): Record<string, any> {
  const params: Record<string, any> = {
    color_count: 12,
    tatami_density: 0.4,
  };

  switch (strategy.vectorizationMode) {
    case 'posterize':
      params.mode = 'hybrid';
      params.color_count = Math.min(strategy.recommendedParams.maxColors, 16);
      break;
    case 'edge-trace':
      params.mode = 'hybrid';
      params.color_count = Math.min(strategy.recommendedParams.maxColors, 8);
      break;
    case 'color-quantize':
      params.mode = 'hybrid';
      params.color_count = strategy.recommendedParams.maxColors;
      break;
    case 'skip':
      params.mode = 'hybrid';
      params.color_count = 64;
      break;
  }

  switch (strategy.detailPreservation) {
    case 'high':
      params.tatami_density = 0.5;
      break;
    case 'medium':
      params.tatami_density = 0.4;
      break;
    case 'low':
      params.tatami_density = 0.3;
      break;
  }

  switch (strategy.stitchType) {
    case 'satin':
      params.tatami_density = 0.6;
      break;
    case 'running':
      params.tatami_density = 0.2;
      break;
  }

  return params;
}
