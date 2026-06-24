/**
 * Extract actual pixels from image using canvas
 * This runs in the browser where canvas APIs are available
 */

export async function extractImagePixels(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        // Cap at 200px — más grande hace timeout en el backend
        const aspect = img.width / img.height;
        let w = Math.min(img.width, 200);
        let h = Math.round(w / aspect);
        if (h > 200) { h = 200; w = Math.round(h * aspect); }
        w = Math.max(8, w); h = Math.max(8, h);

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');
        
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        
        // Mantener como Uint8ClampedArray (JSON.stringify lo convierte a array automáticamente)
        resolve({
          pixels: imageData.data, // Uint8ClampedArray → será array en JSON
          width: w,
          height: h
        });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}