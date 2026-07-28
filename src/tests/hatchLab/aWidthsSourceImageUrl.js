/**
 * aWidthsSourceImageUrl.js — fixed source image for BASE-ENGINE-A-WIDTHS-V1.
 *
 * The one-click capture page reads the URL from here, so the user never pastes
 * anything. The harness still recomputes the SHA-256 of the fetched bytes and
 * refuses to run the engine unless it equals SOURCE_IMAGE.sha256.
 *
 * Verification performed on 2026-07-28 over the bytes actually served by this
 * URL (chat attachment): 65 398 bytes, 1024 x 819 px, no pHYs chunk,
 * SHA-256 32865C44B176D03A5003F535BE9E2927582482C93F0D5088FAC22BCF18213FEC.
 * The verified reference is 46 432 bytes, 1181 x 945 px, 300 dpi,
 * SHA-256 4CB26E42A48E7D9F9D763CC644DA7B2FDB95A2022A65CDE50C05745619C12005.
 * The chat upload path resized and recompressed the PNG, so this URL currently
 * does NOT serve the exact sheet and the page keeps the button disabled.
 */

export const A_WIDTHS_SOURCE_IMAGE_URL =
  'https://media.base44.com/images/public/6a3a74a332b0ea528996ab54/120a505b0_HATCH-A-WIDTHS-EXACT-100x80mm-300dpi.png';

/** Measured on the bytes this URL really serves — informative, never trusted. */
export const A_WIDTHS_SOURCE_URL_OBSERVATION = Object.freeze({
  verifiedAt: '2026-07-28',
  bytes: 65398,
  widthPx: 1024,
  heightPx: 819,
  sha256: '32865C44B176D03A5003F535BE9E2927582482C93F0D5088FAC22BCF18213FEC',
  matchesReference: false,
  reason: 'The chat upload pipeline resized 1181x945 to 1024x819 and recompressed the PNG (pHYs dpi chunk dropped), so the bytes are not the exact sheet.',
});