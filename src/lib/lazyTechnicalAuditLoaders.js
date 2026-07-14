let regionCoveragePromise;
let previewParityPromise;
let engineBenchmarkPromise;

export function loadRegionCoverageAudit() {
  regionCoveragePromise ||= import('@/lib/audits/regionToCommandCoverageAudit.js');
  return regionCoveragePromise;
}

export function loadPreviewExportParityAudit() {
  previewParityPromise ||= import('@/lib/audits/previewToExportParityAudit.js');
  return previewParityPromise;
}

export function loadEngineProfileBenchmarkAudit() {
  engineBenchmarkPromise ||= import('@/lib/audits/engineProfileBenchmark.js');
  return engineBenchmarkPromise;
}