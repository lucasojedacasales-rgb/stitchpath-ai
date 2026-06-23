/**
 * Extract actual pixels from image using canvas
 * This runs in the browser where canvas APIs are available
 */

export async function extractImagePixels(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = Math.min(img.width, 800); // Cap at 800px for performance
      const h = Math.min(img.height, 800);

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      resolve({
        pixels: Array.from(imageData.data),
        width: w,
        height: h
      });
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageUrl;
  });
}