/**
 * renderSatinCandidateSvg.js — compact technical preview of a measured satin
 * candidate. Diagnostic drawing only: never a machine preview, never a
 * simulation of the productive Final Look.
 *
 * Layers: polygon · principal axis · zigzag trajectory · left rail · right rail ·
 * station centerline · first/last markers · scale bar · metrics header.
 * Coordinates are rounded to 0.1 px purely to keep the file small.
 */

const PX_PER_MM = 10;
const PAD = 20;
const HEADER = 90;
// Integer px rounding keeps the persisted preview small; it is a diagnostic
// drawing, never a measurement source.
const r1 = (v) => Math.round(v);

export function renderSatinCandidateSvg(result) {
  if (!result || !Array.isArray(result.pointsMm) || result.pointsMm.length < 3) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="6" y="24" font-size="11">no geometry available</text></svg>';
  }
  const poly = result.pointsMm;
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  const tx = (p) => [r1((p[0] - minX) * PX_PER_MM + PAD), r1((p[1] - minY) * PX_PER_MM + PAD)];
  const pathOf = (pts) => pts.map(tx).map((p) => `${p[0]},${p[1]}`).join(' ');

  const width = Math.max(470, (maxX - minX) * PX_PER_MM + PAD * 2);
  const bodyHeight = (maxY - minY) * PX_PER_MM + PAD * 2;
  const height = r1(HEADER + bodyHeight + 55);

  const st = result.straightness || {};
  const cn = result.containment || {};
  const m = result.zigzag ? result.zigzag.metrics : {};
  const rails = result.rails || {};
  const f = (v, n = 4) => (typeof v === 'number' ? v.toFixed(n) : 'n/a');

  const lines = [
    `${result.caseId} · ${result.regionId} · ${result.status}`,
    `spacingMm ${result.options.spacingMm} · stations ${rails.successfulStations}/${rails.stationCount} · allPaired ${result.allStationsPaired} · gaps ${result.stationGapCount}`,
    `widthMm mean ${f(rails.meanWidthMm, 3)} · stitches ${m.stitchCount} · maxStitchMm ${f(m.maximumStitchLengthMm, 3)} · split ${m.splitRequired}`,
    `centerline devMaxMm ${f(st.centerlineMaximumDeviationMm)} rms ${f(st.centerlineRmsDeviationMm)} ratio ${f(st.centerlineDeviationRatio, 5)} axisD° ${f(st.principalAxisVsCenterlineAngleDeltaDeg)}`,
    `containment ${cn.containmentStatus} · outside ${cn.outsideSampleCount}/${cn.samplesChecked} samples · eligibility ${result.eligibility} · geometryComplete ${result.geometryComplete}`,
    `holes ${result.holeStatus} (${result.declaredHoleCount}) · 1 mm = ${PX_PER_MM} px · candidateOnly true · integrated false`,
  ];
  const header = lines
    .map((t, i) => `<text x="8" y="${14 + i * 13}" font-size="10" font-family="monospace" fill="#111">${t}</text>`)
    .join('');

  const axisA = result.axis ? [
    result.axis.centroidMm[0] + result.axis.majorAxis[0] * result.axis.projection.sMin,
    result.axis.centroidMm[1] + result.axis.majorAxis[1] * result.axis.projection.sMin,
  ] : null;
  const axisB = result.axis ? [
    result.axis.centroidMm[0] + result.axis.majorAxis[0] * result.axis.projection.sMax,
    result.axis.centroidMm[1] + result.axis.majorAxis[1] * result.axis.projection.sMax,
  ] : null;

  const parts = [];
  parts.push(`<polygon points="${pathOf(poly)}" fill="#e2e8f0" stroke="#334155" stroke-width="0.8"/>`);
  if (axisA && axisB) {
    const a = tx(axisA), b = tx(axisB);
    parts.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="5 3"/>`);
  }
  if (result.zigzag && result.zigzag.pointsMm.length) {
    parts.push(`<polyline points="${pathOf(result.zigzag.pointsMm)}" fill="none" stroke="#7c3aed" stroke-width="0.7" opacity="0.9"/>`);
  }
  if (rails.leftRail && rails.leftRail.length) parts.push(`<polyline points="${pathOf(rails.leftRail)}" fill="none" stroke="#2563eb" stroke-width="1"/>`);
  if (rails.rightRail && rails.rightRail.length) parts.push(`<polyline points="${pathOf(rails.rightRail)}" fill="none" stroke="#16a34a" stroke-width="1"/>`);
  if (rails.centerPoints && rails.centerPoints.length) parts.push(`<polyline points="${pathOf(rails.centerPoints)}" fill="none" stroke="#f59e0b" stroke-width="0.8" stroke-dasharray="3 2"/>`);
  if (result.zigzag && result.zigzag.pointsMm.length >= 2) {
    const first = tx(result.zigzag.pointsMm[0]);
    const last = tx(result.zigzag.pointsMm[result.zigzag.pointsMm.length - 1]);
    parts.push(`<circle cx="${first[0]}" cy="${first[1]}" r="2.4" fill="#0f172a"/>`);
    parts.push(`<circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="#dc2626"/>`);
  }

  const scale = `<line x1="8" y1="${r1(height - 16)}" x2="${8 + 10 * PX_PER_MM}" y2="${r1(height - 16)}" stroke="#111" stroke-width="2"/>`
    + `<text x="${12 + 10 * PX_PER_MM}" y="${r1(height - 12)}" font-size="10" font-family="monospace" fill="#111">10 mm</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r1(width)}" height="${height}" viewBox="0 0 ${r1(width)} ${height}">`
    + `<rect width="100%" height="100%" fill="#ffffff"/>${header}`
    + `<g transform="translate(0,${HEADER})">${parts.join('')}</g>${scale}</svg>`;
}