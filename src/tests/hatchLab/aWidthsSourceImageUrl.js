/**
 * aWidthsSourceImageUrl.js — fixed source image for BASE-ENGINE-A-WIDTHS-V1.
 *
 * The one-click capture page reads the URL from here, so the user never pastes
 * anything. The harness still recomputes the SHA-256 of the fetched bytes and
 * refuses to run the engine unless it equals SOURCE_IMAGE.sha256.
 *
 * Provenance: HATCH-A-WIDTHS-EXACT-PARA-BASE44.zip → the single entry
 * HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png, inflated from the ZIP and published
 * through the raw file upload path (never the chat image endpoint). The bytes
 * were re-downloaded from the published URL and re-hashed: 46 432 bytes,
 * 1181 × 945 px, chunks IHDR · pHYs (300 dpi) · IDAT · IEND, SHA-256
 * 4CB26E42A48E7D9F9D763CC644DA7B2FDB95A2022A65CDE50C05745619C12005 — identical
 * to the ZIP entry, so the file flow performed no transformation.
 */

export const A_WIDTHS_SOURCE_IMAGE_URL =
  'https://base44.app/api/apps/6a3a74a332b0ea528996ab54/files/mp/public/6a3a74a332b0ea528996ab54/6e513c7d2_HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png';

/** Measured on the bytes this URL really serves — informative, never trusted. */
export const A_WIDTHS_SOURCE_URL_OBSERVATION = Object.freeze({
  verifiedAt: '2026-07-28',
  bytes: 46432,
  widthPx: 1181,
  heightPx: 945,
  dpi: 300,
  chunks: ['IHDR', 'pHYs', 'IDAT', 'IEND'],
  sha256: '4CB26E42A48E7D9F9D763CC644DA7B2FDB95A2022A65CDE50C05745619C12005',
  matchesReference: true,
  source: 'HATCH-A-WIDTHS-EXACT-PARA-BASE44.zip → HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png',
});

/**
 * REJECTED source — kept only so it can never be reused by mistake. The chat
 * image endpoint resized 1181x945 to 1024x819, recompressed the PNG and dropped
 * the pHYs chunk, changing the hash.
 */
export const A_WIDTHS_REJECTED_SOURCES = Object.freeze([Object.freeze({
  url: 'https://media.base44.com/images/public/6a3a74a332b0ea528996ab54/120a505b0_HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png',
  status: 'rejected',
  bytes: 65398,
  widthPx: 1024,
  heightPx: 819,
  sha256: '32865C44B176D03A5003F535BE9E2927582482C93F0D5088FAC22BCF18213FEC',
  reason: 'Transformed by the chat image endpoint: resized, recompressed, pHYs dropped, hash changed.',
})]);