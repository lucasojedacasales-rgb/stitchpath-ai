/**
 * Extract pixels from an image URL using canvas.
 * Handles CORS by fetching the image as blob first.
 * Returns pixels as a plain Array (not Uint8ClampedArray) so JSON.stringify works correctly.
 */

export async function extractImagePixels(imageUrl) {
  // Fetch image as blob to avoid CORS issues with crossOrigin attribute
  let objectUrl = null;
  try {
    const response = await fetch(imageUrl, { mode: 'cors' });
    if (!response.ok) throw new Error('fetch failed');
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
  } catch {
    // Fallback: use direct URL (works if same-origin or server allows)
    objectUrl = imageUrl;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const aspect = img.naturalWidth / img.naturalHeight;
        // Cap at 150px — enough detail, keeps payload small (~90KB max)
        let w = Math.min(img.naturalWidth, 150);
        let h = Math.round(w / aspect);
        if (h > 150) { h = 150; w = Math.round(h * aspect); }
        w = Math.max(8, Math.round(w));
        h = Math.max(8, Math.round(h));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context');

        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);

        // Convert Uint8ClampedArray → plain Array so JSON.stringify serializes correctly
        const pixels = Array.from(imageData.data);

        if (objectUrl !== imageUrl) URL.revokeObjectURL(objectUrl);

        console.log(`[PIXELS] Extracted ${w}x${h} = ${pixels.length / 4} pixels`);
        resolve({ pixels, width: w, height: h });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Image load failed'));
    img.src = objectUrl;
  });
}