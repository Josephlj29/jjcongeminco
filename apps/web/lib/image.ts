/**
 * lib/image.ts
 *
 * Compresión de imágenes en el cliente antes de subirlas a Storage. Las fotos
 * que llegan de cámara/galería suelen pesar varios MB; subirlas así de pesadas
 * dispara el Cached Egress de Supabase en cada descarga futura (miniaturas,
 * listas, lightbox), aunque en pantalla se vean de 40px. Redimensionar y
 * recomprimir acá corta ese costo en el mismo porcentaje para siempre.
 *
 * Si el navegador no soporta la API usada o la imagen ya es liviana, se
 * devuelve el archivo original: nunca debe bloquear una subida.
 */
const DIMENSION_MAXIMA = 1600;
const CALIDAD_JPEG = 0.75;

export async function comprimirImagen(
  file: File,
  opciones: { dimensionMaxima?: number; calidad?: number } = {},
): Promise<File> {
  const { dimensionMaxima = DIMENSION_MAXIMA, calidad = CALIDAD_JPEG } = opciones;

  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // formato no decodificable por el navegador (raro): se sube tal cual
  }

  try {
    const escala = Math.min(1, dimensionMaxima / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", calidad),
    );
    if (!blob || blob.size >= file.size) return file; // no vale la pena si no achica

    const nombre = file.name.replace(/\.[^./\\]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
