/**
 * Extract pixels from an image URL using canvas.
 * Returns { pixels: Array (RGBA plain), width, height }
 */
export async function extractImagePixels(imageUrl) {
  // Step 1: fetch as blob to avoid CORS canvas taint
  let src = imageUrl;
  try {
    const resp = await fetch(imageUrl, { cache: 'force-cache' });
    if (resp.ok) src = URL.createObjectURL(await resp.blob());
  } catch { /* fallback to direct url */ }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight || 1;
      let w = Math.min(img.naturalWidth, 128);
      let h = Math.round(w / aspect);
      if (h > 128) { h = 128; w = Math.round(h * aspect); }
      w = Math.max(8, w);
      h = Math.max(8, h);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      let pixels;
      try {
        pixels = Array.from(ctx.getImageData(0, 0, w, h).data);
      } catch {
        // Canvas tainted — draw without taint check by re-fetching was already done
        reject(new Error('Canvas tainted — could not extract pixels'));
        return;
      }

      if (src !== imageUrl) URL.revokeObjectURL(src);
      console.log(`[PIXELS] ${w}x${h} = ${pixels.length / 4} px`);
      resolve({ pixels, width: w, height: h });
    };

    img.onerror = () => reject(new Error('Image load failed: ' + imageUrl));
    img.src = src;
  });
}