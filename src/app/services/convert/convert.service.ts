import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ConvertService {

  /**
   * Carga un File (PNG/JPG) en un objeto Image.
   */
  private fileToImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Convierte un File de imagen a un Blob WebP con la calidad indicada.
   * @param file PNG o JPG
   * @param quality entre 0.0 (muy baja) y 1.0 (máxima)
   */
  async convertToWebP(file: File, quality = 0.9): Promise<Blob> {
    const img = await this.fileToImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('No se generó el Blob WebP'));
      }, 'image/webp', quality);
    });
  }

  
}
