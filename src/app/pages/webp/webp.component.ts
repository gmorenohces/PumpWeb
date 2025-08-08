// webp.component.ts

import { CommonModule } from "@angular/common";
import { Component, ElementRef, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import JSZip from "jszip";
import { saveAs } from "file-saver";

import { ConvertService } from "../../services/convert/convert.service";

import { SpinViewerComponent } from "../../shared/spin-viewer/spin-viewer.component";
import pica from "pica";

// type Step = "select" | "ready" | "processing" | "done";
type Step = "reference" | "select" | "ready" | "processing" | "done";

@Component({
  selector: "app-webp",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    SpinViewerComponent,
  ],
  templateUrl: "./webp.component.html",
  styleUrls: ["./webp.component.css"],
})
export class WebpComponent {
  @ViewChild("fileInput", { static: true })
  fileInput!: ElementRef<HTMLInputElement>;

  @ViewChild("refInput", { static: true })
  refInput!: ElementRef<HTMLInputElement>;

  // Banner inicial
  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;

  // Estado de la UI
  // step: Step = "select";

  step: Step = "reference"; // arrancamos en el paso de referencia
  referenceFile: File | null = null;
  referenceUrl = "";
  croppedUrl = "";

  cropTop = 1;
  cropBottom = 1;
  cropLeft = 1;
  cropRight = 1;
  skipCropping = false;

  errorMessage = "";
  progress = 0;

  originalWidth = 0;
  originalHeight = 0;

  // Parámetros de entrada
  selectedFiles: File[] = [];
  quality = 0.9; // compresión WebP [0.1–1]
  scale = 1.0; // factor de reescalado [0.5–3]

  maxEstimatedSize = 0;

  minCrop = 50;
  userPadding = 50;

  // Resultados
  convertedBlobs: Blob[] = [];
  original360Urls: string[] = [];
  processed360Urls: string[] = [];

  constructor(private convertService: ConvertService) {}

  get scaledWidth(): number {
    return Math.round(this.originalWidth * this.scale);
  }
  get scaledHeight(): number {
    return Math.round(this.originalHeight * this.scale);
  }

  onScaleChange(): void {
    this.updateEstimates();
  }

  onQualityChange(): void {
    this.updateEstimates();
  }

  /** Se dispara al cargar la imagen de referencia */
  async onReferenceSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.referenceFile = input.files[0];
    this.referenceUrl = URL.createObjectURL(this.referenceFile);

    // Detectar automáticamente los bordes no vacíos
    const bounds = await this.detectCropBounds(this.referenceFile);
    this.cropLeft = bounds.left;
    this.cropTop = bounds.top;
    this.cropRight = bounds.right;
    this.cropBottom = bounds.bottom;
    await this.updateCroppedPreview();
  }

  async onPaddingChange() {
    if (!this.referenceFile) return;
    const b = await this.detectCropBounds(this.referenceFile);
    this.cropLeft = b.left;
    this.cropTop = b.top;
    this.cropRight = b.right;
    this.cropBottom = b.bottom;
    await this.updateCroppedPreview();
  }

  async onCropChange() {
    if (!this.referenceFile) return;
    await this.updateCroppedPreview();
  }

  private async updateCroppedPreview() {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = this.referenceUrl;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cx = this.cropLeft;
    const cy = this.cropTop;
    const cw = w - (this.cropLeft + this.cropRight);
    const ch = h - (this.cropTop + this.cropBottom);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

    this.croppedUrl = canvas.toDataURL("image/png");
    this.originalWidth = cw;
    this.originalHeight = ch;
    await this.updateEstimates();
  }

  /** Omitir recorte y continuar */
  skipReference(): void {
    this.skipCropping = true;
    this.step = "select";
  }

  /** Confirmar recorte y pasar a selección de todas las imágenes */
  confirmReference(): void {
    this.step = "select";
  }

  /**
   * Analiza píxel a píxel la imagen para encontrar la caja mínima
   * que contenga contenido no transparente o distinto de fondo.
   */
  private async detectCropBounds(
    file: File
  ): Promise<{ left: number; top: number; right: number; bottom: number }> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });

    const w = img.naturalWidth,
      h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4 + 3; // canal alpha
        if (data[idx] > 10) {
          // píxel significativo
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Y luego, en detectCropBounds:
    const pad = this.userPadding;
    //const pad = this.userPadding;   // <-- aquí pones 5, 10, 50...
    const left = Math.max(0, minX - pad);
    const top = Math.max(0, minY - pad);
    const right = Math.max(0, w - maxX - pad);
    const bottom = Math.max(0, h - maxY - pad);

    // Calcula márgenes, respetando un mínimo de 1px
    return { left, top, right, bottom };
  }

  /** Habilita o no el botón de convertir */
  get canConvert(): boolean {
    return this.selectedFiles.length > 0;
  }

  /** Pequeña espera para que la animación muestre progreso mínimo */
  private delay(ms: number): Promise<void> {
    return new Promise((res) => setTimeout(res, ms));
  }

  /**
   * Redimensiona la imagen con pica y devuelve un Blob PNG
   */
  // private async resizeWithPica(file: File): Promise<Blob> {
  //   // 1) crear HTMLImageElement
  //   const img = await new Promise<HTMLImageElement>((res, rej) => {
  //     const image = new Image();
  //     image.onload = () => res(image);
  //     image.onerror = rej;
  //     image.src = URL.createObjectURL(file);
  //   });

  //   // 2) canvas origen
  //   const srcCanvas = document.createElement("canvas");
  //   srcCanvas.width = img.naturalWidth;
  //   srcCanvas.height = img.naturalHeight;
  //   srcCanvas.getContext("2d")!.drawImage(img, 0, 0);

  //   // 3) canvas destino
  //   const destCanvas = document.createElement("canvas");
  //   destCanvas.width = Math.round(img.naturalWidth * this.scale);
  //   destCanvas.height = Math.round(img.naturalHeight * this.scale);

  //   // 4) pica resize
  //   await pica().resize(srcCanvas, destCanvas);

  //   // 5) exportar a Blob PNG
  //   return await new Promise<Blob>((res, rej) => {
  //     destCanvas.toBlob(
  //       (b) => (b ? res(b) : rej(new Error("No se obtuvo blob"))),
  //       "image/png"
  //     );
  //   });
  // }

  private async resizeWithPica(file: File): Promise<Blob> {
    // 1) cargar imagen
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const image = new Image();
      image.onload = () => res(image);
      image.onerror = rej;
      image.src = URL.createObjectURL(file);
    });

    // 2) determinar recorte
    const cx = this.skipCropping ? 0 : this.cropLeft;
    const cy = this.skipCropping ? 0 : this.cropTop;
    const cw =
      img.naturalWidth -
      (this.skipCropping ? 0 : this.cropLeft + this.cropRight);
    const ch =
      img.naturalHeight -
      (this.skipCropping ? 0 : this.cropTop + this.cropBottom);

    // 3) canvas origen recortado
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = cw;
    srcCanvas.height = ch;
    srcCanvas.getContext("2d")!.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

    // 4) canvas destino escalado
    const destCanvas = document.createElement("canvas");
    destCanvas.width = Math.round(cw * this.scale);
    destCanvas.height = Math.round(ch * this.scale);

    // 5) pica resize
    await pica().resize(srcCanvas, destCanvas);

    // 6) exportar a blob PNG
    return await new Promise<Blob>((res, rej) => {
      destCanvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("No se obtuvo blob"))),
        "image/png"
      );
    });
  }

  /**
   * Se dispara al seleccionar archivos:
   * - guarda los File[]
   * - genera URLs de preview para los originales
   */
  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.step = "select";
      return;
    }

    this.selectedFiles = Array.from(input.files);
    this.original360Urls = this.selectedFiles.map((f) =>
      URL.createObjectURL(f)
    );

    // ─── Obtengo dimensiones de la primera imagen ─────────────────
    const firstFile = this.selectedFiles[0];
    const imgEl = new Image();
    imgEl.onload = () => {
      this.originalWidth = imgEl.naturalWidth;
      this.originalHeight = imgEl.naturalHeight;
    };
    imgEl.src = URL.createObjectURL(firstFile);

    this.convertedBlobs = [];
    this.processed360Urls = [];
    this.updateEstimates();
    this.step = "ready";
  }

  private updateEstimates(): void {
    if (!this.selectedFiles.length) {
      this.maxEstimatedSize = 0;
      return;
    }
    // Aproximación: nuevo tamaño ≈ original_bytes × scale² × quality
    const estimates = this.selectedFiles.map(
      (f) => f.size * this.scale * this.scale * this.quality
    );
    this.maxEstimatedSize = Math.max(...estimates);
  }

  /** Formatea bytes en B, KB o MB */
  get formattedMaxEstimatedSize(): string {
    const b = this.maxEstimatedSize;
    if (b < 1024) return `${b.toFixed(0)} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(2)} MB`;
  }

  /** Cancela la selección y vuelve al paso inicial */
  cancelSelection(): void {
    this.selectedFiles = [];
    this.fileInput.nativeElement.value = "";
    this.errorMessage = "";
    this.step = "select";
  }

  /**
   * Procesa el lote:
   * 1) redimensiona con pica
   * 2) convierte a WebP via servicio
   * 3) actualiza progreso y listas de URLs
   */
  async uploadFiles(): Promise<void> {
    this.errorMessage = "";
    this.progress = 0;
    this.convertedBlobs = [];
    this.processed360Urls = [];
    this.step = "processing";

    const start = performance.now();

    try {
      for (let i = 0; i < this.selectedFiles.length; i++) {
        // a) redimensionar
        const pngBlob = await this.resizeWithPica(this.selectedFiles[i]);

        // b) convertir a WebP
        const webpBlob = await this.convertService.convertToWebP(
          new File([pngBlob], this.selectedFiles[i].name, {
            type: "image/png",
          }),
          this.quality
        );
        this.convertedBlobs.push(webpBlob);

        // c) crear URL para visor
        this.processed360Urls.push(URL.createObjectURL(webpBlob));

        // d) actualizar progreso
        this.progress = Math.round(((i + 1) / this.selectedFiles.length) * 100);
      }

      // forzar mínimo de 1 s de espera para que se vea la barra
      const elapsed = performance.now() - start;
      if (elapsed < 1000) {
        await this.delay(1000 - elapsed);
      }

      this.step = "done";
      this.progress = 100;
    } catch (err: any) {
      console.error(err);
      this.errorMessage = err?.message || "Error procesando imágenes";
      this.step = "select";
    }
  }

  /** Descarga todos los blobs .webp y resetea */
  async download(): Promise<void> {
    if (!this.convertedBlobs.length) {
      return;
    }
    const zip = new JSZip();

    // Añadimos cada blob al ZIP con su nombre
    this.convertedBlobs.forEach((blob, idx) => {
      // Usamos el nombre original adaptado a .webp
      const filename = this.selectedFiles[idx].name.replace(/\.\w+$/, ".webp");
      zip.file(filename, blob);
    });

    // Generamos el ZIP y forzamos la descarga
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "converted_images.zip");

    // Reseteamos el estado (opcional)
    this.reset();
  }

  /** Resetea estado para un nuevo lote */
  reset(): void {
    this.selectedFiles = [];
    this.convertedBlobs = [];
    this.original360Urls = [];
    this.processed360Urls = [];
    this.progress = 0;
    this.errorMessage = "";
    //this.fileInput.nativeElement.value = "";
    //this.refInput.nativeElement.value = "";
    this.step = "reference";
  }
}
