/**
 * renderSatinCandidateSvg.js — technical SVG preview of a measured candidate.
 * Raw geometry in millimetres; no thread simulation, no Final Look.
 */

const fmt = (v) => Number(v.toFixed(4));

export function renderSatinCandidateSvg(result) {
  if (!result.pointsMm || !result.axis || !result.rails || !result.zigzag) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120"><text x="10" y="30" font-size="12">${result.caseId}: no geometry (status ${result.status})</text></svg>`;
  }
  const pts = result.pointsMm;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = 2, S = 40; // 40 px per mm
  const W = (maxX - minX + 2 * pad), H = (maxY - minY + 2 * pad);
  const tx = (x) => fmt((x - minX + pad) * S);
  const ty = (y) => fmt((y - minY + pad) * S);
  const poly = pts.map(([x, y]) => `${tx(x)},${ty(y)}`).join(' ');

  const { axis, rails, zigzag } = result;
  const [cx, cy] = axis.centroidMm;
  const a1 = [cx + axis.majorAxis[0] * axis.projection.sMin, cy + axis.majorAxis[1] * axis.projection.sMin];
  const a2 = [cx + axis.majorAxis[0] * axis.projection.sMax, cy + axis.majorAxis[1] * axis.projection.sMax];

  const railPath = (rail) => rail.map(([x, y]) => `${tx(x)},${ty(y)}`).join(' ');
  const zig = zigzag.pointsMm.map(([x, y]) => `${tx(x)},${ty(y)}`).join(' ');
  const stationMarks = result.rails.stations.filter((s) => s.centerPoint)
    .map((s) => `<circle cx="${tx(s.centerPoint[0])}" cy="${ty(s.centerPoint[1])}" r="1.5" fill="#f59e0b"/>`).join('');
  const pairMarks = result.rails.stations.filter((s) => s.leftRailPoint)
    .map((s) => `<circle cx="${tx(s.leftRailPoint[0])}" cy="${ty(s.leftRailPoint[1])}" r="1.2" fill="#22c55e"/><circle cx="${tx(s.rightRailPoint[0])}" cy="${ty(s.rightRailPoint[1])}" r="1.2" fill="#3b82f6"/>`).join('');

  const m = zigzag.metrics;
  const infoLines = [
    `${result.caseId} · ${result.regionId}`,
    `spacingMm ${result.options.spacingMm} · meanWidthMm ${rails.meanWidthMm?.toFixed(3)} · maxStitchMm ${m.maximumStitchLengthMm?.toFixed(3)}`,
    `eligibility ${result.eligibility} · splitRequired ${m.splitRequired} · scale: 1 mm = ${S} px`,
  ].map((line, i) => `<text x="8" y="${16 + i * 14}" font-size="11" font-family="monospace" fill="#111">${line}</text>`).join('');

  // 10 mm scale bar
  const barY = fmt(H * S + 46);
  const scaleBar = `<line x1="8" y1="${barY}" x2="${fmt(8 + 10 * S)}" y2="${barY}" stroke="#111" stroke-width="2"/><text x="8" y="${barY + 14}" font-size="10" font-family="monospace" fill="#111">10 mm</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(Math.max(W * S, 460))}" height="${fmt(H * S + 70)}" viewBox="0 0 ${fmt(Math.max(W * S, 460))} ${fmt(H * S + 70)}">
<rect width="100%" height="100%" fill="#ffffff"/>
<g transform="translate(0,52)">
<polygon points="${poly}" fill="#e2e8f0" stroke="#334155" stroke-width="1"/>
<line x1="${tx(a1[0])}" y1="${ty(a1[1])}" x2="${tx(a2[0])}" y2="${ty(a2[1])}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 3"/>
<polyline points="${railPath(rails.leftRail)}" fill="none" stroke="#16a34a" stroke-width="1"/>
<polyline points="${railPath(rails.rightRail)}" fill="none" stroke="#2563eb" stroke-width="1"/>
<polyline points="${zig}" fill="none" stroke="#7c3aed" stroke-width="0.8" opacity="0.85"/>
${stationMarks}
${pairMarks}
</g>
${infoLines}
${scaleBar}
</svg>`;
}