/**
 * Stage 2: Image Enhancement
 * Input:  ctx.imageUrl, ctx.config, ctx.analysis
 * Output: ctx.enhanced (EnhancedImageResult)
 */

import { preprocessImage } from '../../imagePreprocessor.js';
import { getModeStrategy } from '../../digitizeModes.js';
import { base44 } from '@/api/base44Client';
import { debugStage } from '../types.js';

export async function runImageEnhancement(ctx) {
  const strategy = getModeStrategy(ctx.config.mode || 'hybrid');
  const settings = strategy.preprocess || {};

  if (!settings.enabled) {
    ctx.enhanced = {
      originalUrl:     ctx.imageUrl,
      enhancedUrl:     ctx.imageUrl,
      blob:            null,
      width:           ctx.analysis?.imageWidth  || 0,
      height:          ctx.analysis?.imageHeight || 0,
      appliedSettings: settings,
    };
    return;
  }

  const result = await preprocessImage(ctx.imageUrl, settings);

  // Upload enhanced image so backend/Claude can access it
  const { file_url } = await base44.integrations.Core.UploadFile({ file: result.blob });

  ctx.enhanced = {
    originalUrl:     ctx.imageUrl,
    enhancedUrl:     file_url,
    blob:            result.blob,
    width:           result.width,
    height:          result.height,
    appliedSettings: settings,
  };

  debugStage('image_enhancement',
    { originalSize: `${ctx.analysis?.imageWidth || 0}×${ctx.analysis?.imageHeight || 0}` },
    { enhancedSize: `${result.width}×${result.height}`, settings: ctx.enhanced.appliedSettings }
  );
}