/**
 * adaptiveDensity.js — FASE 9: Motor de Densidad Adaptativa
 * ──────────────────────────────────────────────────────────────────────────────
 * La densidad de puntada NO es fija. Se calcula dinámicamente en función de:
 *
 *   D1 — Área          : zonas pequeñas necesitan más densidad para cobertura
 *   D2 — Tipo de tela  : Lycra/Seda requieren mayor densidad; Denim/Lino menor
 *   D3 — Ángulo        : ángulos diagonales (45°) distribuyen mejor → densidad ligeramente menor
 *   D4 — Tamaño físico : ancho/alto del diseño escala la densidad base
 *   D5 — Tipo de puntada: satin, fill-tatami y running tienen regímenes distintos
 *
 * API principal:
 *   computeAdaptiveDensity(region, fabricType, designWidthMm, designHeightMm) → mm
 *
 * Rango de salida garantizado:
 *   fill    : [0.28, 0.60] mm
 *   satin   : [0.25, 0.55] mm
 *   running : retorna 0 (no aplica)
 */

import { FABRIC_MODEL } from './stitchIntelligence.js';

// ─── Constantes de referencia ─────────────────────────────────────────────────

// Densidades base por tipo de puntada (mm entre filas)
const BASE_DENSITY = {
  fill:            0.40,  // Wilcom reference for 40wt polyester on cotton
  satin:           0.38,  // satin más compacto por naturaleza
  running_stitch:  0,     // N/A — el running no tiene "rows"
};

// Límites físicos absolutos (máquina + tela)
const DENSITY_LIMITS = {
  fill:   { min: 0.28, max: 0.60 },
  satin:  { min: 0.25, max: 0.55 },
};

// ─── D1: Señal de Área ────────────────────────────────────────────────────────

/**
 * Regiones pequeñas necesitan más densidad (filas más juntas) para garantizar
 * cobertura total sin gaps visibles. Regiones grandes pueden abrirse ligeramente
 * para reducir tensión en la tela y tiempo de máquina.
 *
 * Curva: exponencial inversa suavizada.
 *   área <  10mm² → +0.060 (muy pequeño: máxima densidad)
 *   área <  30mm² → +0.035
 *   área < 100mm² → +0.010
 *   área < 300mm² →  0.000 (neutro)
 *   área > 500mm² → -0.015 (grande: abrir ligeramente)
 *   área >1000mm² → -0.025
 */
function densityAdjArea(areaMm2) {
  if (areaMm2 < 10)   return +0.060;
  if (areaMm2 < 30)   return +0.035;
  if (areaMm2 < 100)  return +0.010;
  if (areaMm2 < 300)  return  0.000;
  if (areaMm2 < 500)  return -0.008;
  if (areaMm2 < 1000) return -0.015;
  return -0.025;
}

// ─── D2: Señal de Tela ────────────────────────────────────────────────────────

/**
 * Cada tela tiene un comportamiento distinto ante la tensión del hilo.
 * Se usa FABRIC_MODEL.density_adj como base, pero con escala específica
 * para densidad (no idéntica a pull_compensation, que tiene otro régimen).
 *
 * Lycra: muy elástica → las filas se abren al estirar → densidad mayor (+0.07)
 * Seda:  frágil → densidad algo menor para no dañar fibras (-0.04)
 * Denim: rígido → densidad normal, tirón bajo → neutro (+0.02)
 */
function densityAdjFabric(fabricType) {
  const model = FABRIC_MODEL[fabricType] || FABRIC_MODEL['Algodón'];
  // density_adj ya viene calibrado en stitchIntelligence.js
  // Aplicar con factor de escala 1.0 (directo)
  return model.density_adj;
}

// ─── D3: Señal de Ángulo ──────────────────────────────────────────────────────

/**
 * El ángulo de relleno afecta cómo se distribuye la tensión sobre la tela.
 *
 * Física:
 *   0° / 90° (paralelo al grano) → máxima tensión en una dirección → más densidad necesaria
 *   45°                          → tensión distribuida → densidad puede ser ligeramente menor
 *
 * Ajuste: sinusoide con máximo en 0°/90° (+0.018) y mínimo en 45° (-0.018).
 * Fórmula: adj = +0.018 × cos(2θ)   donde θ en radianes
 *   θ=0°  → cos(0)=1   → +0.018
 *   θ=45° → cos(π/2)=0 → 0.000
 *   θ=90° → cos(π)=-1  → -0.018 (pero 90° es equivalente a 0° en práctica → abs)
 */
function densityAdjAngle(angleDeg) {
  const theta = (angleDeg * Math.PI) / 180;
  return +(0.018 * Math.cos(2 * theta)).toFixed(4);
}

// ─── D4: Señal de Tamaño físico ───────────────────────────────────────────────

/**
 * Diseños pequeños (badge/parche, <50mm) necesitan mayor densidad porque
 * el error de aguja es porcentualmente mayor en zonas pequeñas.
 * Diseños grandes (>200mm) pueden usar densidades más abiertas.
 *
 * Se usa la dimensión menor del diseño como referencia.
 */
function densityAdjSize(designWidthMm, designHeightMm) {
  const minDim = Math.min(designWidthMm || 100, designHeightMm || 100);
  if (minDim < 30)  return +0.025; // badge micro
  if (minDim < 60)  return +0.012; // badge estándar
  if (minDim < 100) return  0.000; // logo pequeño
  if (minDim < 200) return -0.008; // logo medio
  return -0.015;                   // diseño grande
}

// ─── D5: Señal de Tipo de Puntada ─────────────────────────────────────────────

/**
 * Cada tipo de puntada tiene un régimen de densidad diferente.
 * - fill tatami: densidad afecta directamente la cobertura visual
 * - satin: densidad controla el brillo; muy bajo → huecos; muy alto → ridge
 *
 * Además, dentro de fill, se distinguen sub-casos:
 *   - fill en zona muy convexa (convexity > 0.85) → puede abrirse un poco
 *   - fill en zona cóncava/compleja → necesita más densidad en los bordes internos
 */
function densityAdjStitchType(stitchType, region) {
  if (stitchType === 'satin') {
    // Satin base es 0.38 ya. Ajustes por ancho:
    const w = region.mean_width_mm || 3;
    if (w < 2)   return -0.02; // satin muy estrecho: más denso (más columnas por mm)
    if (w > 5.5) return +0.04; // satin ancho: abrir un poco para evitar ridge
    return 0;
  }

  if (stitchType === 'fill') {
    const convexity = region.convexity || 0.7;
    const complexity = region.complexity?.score || 0;
    let adj = 0;
    // Zona muy convexa y simple → puede abrirse levemente
    if (convexity > 0.85 && complexity < 0.20) adj -= 0.010;
    // Zona cóncava o compleja → densidad extra para cobertura en entrantes
    if (convexity < 0.55) adj += 0.020;
    if (complexity > 0.60) adj += 0.015;
    return adj;
  }

  return 0;
}

// ─── API principal ────────────────────────────────────────────────────────────

/**
 * computeAdaptiveDensity — FASE 9 core
 *
 * Calcula la densidad óptima (mm entre filas) para una región de bordado
 * combinando las 5 señales adaptativas.
 *
 * @param {object} region           — región enriquecida (area_mm2, stitch_type, convexity, angle…)
 * @param {string} fabricType       — tipo de tela (clave de FABRIC_MODEL)
 * @param {number} designWidthMm    — ancho del diseño en mm
 * @param {number} designHeightMm   — alto del diseño en mm
 * @returns {number}                — densidad en mm, redondeada a 3 decimales
 */
export function computeAdaptiveDensity(region, fabricType = 'Algodón', designWidthMm = 100, designHeightMm = 100) {
  const stitchType = region.stitch_type || region.recommended_stitch || 'fill';

  // Running stitch: densidad no aplica
  if (stitchType === 'running_stitch') return 0;

  const base = BASE_DENSITY[stitchType] ?? BASE_DENSITY.fill;
  const limits = DENSITY_LIMITS[stitchType] ?? DENSITY_LIMITS.fill;

  // ── Señales ──────────────────────────────────────────────────────────────
  const d1 = densityAdjArea(region.area_mm2 || 0);
  const d2 = densityAdjFabric(fabricType);
  const d3 = densityAdjAngle(region.angle ?? region.fill_angle ?? 45);
  const d4 = densityAdjSize(designWidthMm, designHeightMm);
  const d5 = densityAdjStitchType(stitchType, region);

  const raw = base + d1 + d2 + d3 + d4 + d5;
  const clamped = +Math.max(limits.min, Math.min(limits.max, raw)).toFixed(3);

  return clamped;
}

/**
 * computeAdaptiveDensityDetailed — versión con trazabilidad completa.
 * Devuelve el valor final + el desglose de cada señal.
 * Útil para el panel de Inteligencia y logs de diagnóstico.
 */
export function computeAdaptiveDensityDetailed(region, fabricType = 'Algodón', designWidthMm = 100, designHeightMm = 100) {
  const stitchType = region.stitch_type || region.recommended_stitch || 'fill';
  if (stitchType === 'running_stitch') {
    return { density_mm: 0, base: 0, signals: {}, rationale: 'Running stitch: densidad no aplica.' };
  }

  const base = BASE_DENSITY[stitchType] ?? BASE_DENSITY.fill;
  const limits = DENSITY_LIMITS[stitchType] ?? DENSITY_LIMITS.fill;

  const signals = {
    D1_area:    densityAdjArea(region.area_mm2 || 0),
    D2_fabric:  densityAdjFabric(fabricType),
    D3_angle:   densityAdjAngle(region.angle ?? region.fill_angle ?? 45),
    D4_size:    densityAdjSize(designWidthMm, designHeightMm),
    D5_stitch:  densityAdjStitchType(stitchType, region),
  };

  const raw = base + Object.values(signals).reduce((a, b) => a + b, 0);
  const density_mm = +Math.max(limits.min, Math.min(limits.max, raw)).toFixed(3);

  const rationale = [
    `base_${stitchType}=${base}`,
    `área(${(region.area_mm2 || 0).toFixed(0)}mm²)→${signals.D1_area >= 0 ? '+' : ''}${signals.D1_area.toFixed(3)}`,
    `tela(${fabricType})→${signals.D2_fabric >= 0 ? '+' : ''}${signals.D2_fabric.toFixed(3)}`,
    `ángulo(${(region.angle ?? region.fill_angle ?? 45).toFixed(0)}°)→${signals.D3_angle >= 0 ? '+' : ''}${signals.D3_angle.toFixed(3)}`,
    `tamaño(${Math.min(designWidthMm, designHeightMm).toFixed(0)}mm)→${signals.D4_size >= 0 ? '+' : ''}${signals.D4_size.toFixed(3)}`,
    `tipo(${stitchType})→${signals.D5_stitch >= 0 ? '+' : ''}${signals.D5_stitch.toFixed(3)}`,
    `raw=${raw.toFixed(3)} → clamped=${density_mm}`,
  ].join(', ');

  return { density_mm, base, signals, rationale };
}