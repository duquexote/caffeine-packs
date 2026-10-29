// Redução de imagem em alta qualidade para a exportação. O drawImage do canvas encolhe a imagem de uma vez
// (≈ 3–4x para as latas em 2x) e serrilha letras e bordas; aqui é Lanczos3, como no Figma/Photoshop,
// em alfa pré-multiplicado para as bordas transparentes não escurecerem.

const LOBES = 3;

function sinc(x: number) {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Pesos de cada pixel de saída: índice do primeiro pixel de entrada e os pesos (já normalizados). */
function weights(srcSize: number, dstSize: number) {
  const scale = srcSize / dstSize;
  const filterScale = Math.max(1, scale);
  const support = LOBES * filterScale;
  const out: { start: number; w: Float32Array }[] = [];
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) * scale - 0.5;
    const start = Math.max(0, Math.ceil(center - support));
    const end = Math.min(srcSize - 1, Math.floor(center + support));
    const w = new Float32Array(end - start + 1);
    let sum = 0;
    for (let j = start; j <= end; j++) {
      const x = (j - center) / filterScale;
      const v = Math.abs(x) < LOBES ? sinc(x) * sinc(x / LOBES) : 0;
      w[j - start] = v;
      sum += v;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    out.push({ start, w });
  }
  return out;
}

/** Redimensiona RGBA (não pré-multiplicado, como o getImageData) para dw×dh. */
export function lanczos(src: ImageData, dw: number, dh: number): ImageData {
  const { width: sw, height: sh, data } = src;
  // pré-multiplica
  const pm = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) {
    const a = data[i * 4 + 3] / 255;
    pm[i * 4] = data[i * 4] * a;
    pm[i * 4 + 1] = data[i * 4 + 1] * a;
    pm[i * 4 + 2] = data[i * 4 + 2] * a;
    pm[i * 4 + 3] = data[i * 4 + 3];
  }
  // horizontal
  const wx = weights(sw, dw);
  const tmp = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const row = y * sw * 4;
    for (let x = 0; x < dw; x++) {
      const { start, w } = wx[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const s = row + (start + k) * 4, f = w[k];
        r += pm[s] * f; g += pm[s + 1] * f; b += pm[s + 2] * f; a += pm[s + 3] * f;
      }
      const d = (y * dw + x) * 4;
      tmp[d] = r; tmp[d + 1] = g; tmp[d + 2] = b; tmp[d + 3] = a;
    }
  }
  // vertical + volta para não pré-multiplicado
  const wy = weights(sh, dh);
  const out = new ImageData(dw, dh);
  const o = out.data;
  for (let y = 0; y < dh; y++) {
    const { start, w } = wy[y];
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < w.length; k++) {
        const s = ((start + k) * dw + x) * 4, f = w[k];
        r += tmp[s] * f; g += tmp[s + 1] * f; b += tmp[s + 2] * f; a += tmp[s + 3] * f;
      }
      const d = (y * dw + x) * 4;
      if (a <= 0.5) continue; // transparente
      // Uint8ClampedArray arredonda e corta o "ringing" do Lanczos fora de 0..255
      const k = 255 / a;
      o[d] = r * k; o[d + 1] = g * k; o[d + 2] = b * k; o[d + 3] = a;
    }
  }
  return out;
}
