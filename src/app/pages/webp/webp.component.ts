// import { CommonModule } from "@angular/common";
// import { Component, ElementRef, Input, ViewChild } from "@angular/core";
// import { MatButtonModule } from "@angular/material/button";
// import { MatIconModule } from "@angular/material/icon";
// import { DataService } from "../../services/data/data.service";
// import { ConvertService } from "../../services/convert/convert.service";
// import { MatProgressBarModule } from "@angular/material/progress-bar";

// type Step = "select" | "ready" | "processing" | "done";

// @Component({
//   selector: "app-webp",
//   standalone: true,
//   imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule],
//   templateUrl: "./webp.component.html",
//   styleUrls: ["./webp.component.css"],
// })
// export class WebpComponent {
//   @ViewChild("fileInput") fileInput!: ElementRef<HTMLInputElement>;

//   bannerUrl = "/images/bg_webp.png";
//   bannerHeight = 250;

//   step: Step = "select";
//   selectedFiles: File[] = [];
//   convertedBlobs: Blob[] = [];
//   errorMessage = "";
//   progress = 0;
//   /** Nivel de calidad entre 0.1 y 1.0 */
//   quality = 0.9;

//   constructor(
//     private dataService: DataService,
//     private convertService: ConvertService
//   ) {}

//   get canConvert() {
//     return this.selectedFiles.length > 0;
//   }

//   private delay(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   onFilesSelected(evt: Event) {
//     const input = evt.target as HTMLInputElement;
//     if (!input.files?.length) {
//       this.step = "select";
//       return;
//     }
//     this.selectedFiles = Array.from(input.files);
//     // avanzar al estado "ready" para mostrar botones Cancelar/Convertir
//     this.step = "ready";
//     this.convertedBlobs = [];
//   }

//   /** Cancelar selección y volver al inicio */
//   cancelSelection() {
//     this.selectedFiles = [];
//     this.fileInput.nativeElement.value = "";
//     this.step = "select";
//     this.errorMessage = "";
//   }

//   /** Inicia subida + conversión */
//   async uploadFiles() {
//     this.errorMessage = "";
//     this.step = "processing";
//     this.progress = 0;
//     this.convertedBlobs = [];
//     const start = performance.now();
//     try {
//       // 1) Convertir cada imagen a WebP en cliente
//       for (let i = 0; i < this.selectedFiles.length; i++) {
//         const blob = await this.convertService.convertToWebP(
//           this.selectedFiles[i],
//           this.quality
//         );
//         this.convertedBlobs.push(blob);
//         // actualizar progreso de conversión local (antes de la subida)
//         this.progress = Math.round(((i + 1) / this.selectedFiles.length) * 100);
//       }
//       const elapsed = performance.now() - start;
//       const minimum = 1000; // ms
//       if (elapsed < minimum) {
//         await this.delay(minimum - elapsed);
//       }
//       this.step = "done";
//       this.progress = 100;
//     } catch (err: any) {
//       console.error(err);
//       this.errorMessage = err?.message || "Error en el proceso";
//       this.step = "select";
//     }
//   }

//   reset() {
//     this.selectedFiles = [];
//     this.convertedBlobs = [];
//     this.fileInput.nativeElement.value = "";
//     this.step = "select";
//     this.errorMessage = "";
//     this.progress = 0;
//   }

//   download() {
//     // descarga todos los Blobs convertidos uno a uno
//     this.convertedBlobs.forEach((blob, idx) => {
//       const url = URL.createObjectURL(blob);
//       const a = document.createElement("a");
//       a.href = url;
//       a.download = this.selectedFiles[idx].name.replace(/\.\w+$/, ".webp");
//       a.click();
//       URL.revokeObjectURL(url);
//     });
//     this.reset();
//   }
// }

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

type Step = "select" | "ready" | "processing" | "done";

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

  // Banner inicial
  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;

  // Estado de la UI
  step: Step = "select";
  errorMessage = "";
  progress = 0;

  originalWidth = 0;
  originalHeight = 0;

  // Parámetros de entrada
  selectedFiles: File[] = [];
  quality = 0.9; // compresión WebP [0.1–1]
  scale = 1.0; // factor de reescalado [0.5–3]

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
  private async resizeWithPica(file: File): Promise<Blob> {
    // 1) crear HTMLImageElement
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const image = new Image();
      image.onload = () => res(image);
      image.onerror = rej;
      image.src = URL.createObjectURL(file);
    });

    // 2) canvas origen
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = img.naturalWidth;
    srcCanvas.height = img.naturalHeight;
    srcCanvas.getContext("2d")!.drawImage(img, 0, 0);

    // 3) canvas destino
    const destCanvas = document.createElement("canvas");
    destCanvas.width = Math.round(img.naturalWidth * this.scale);
    destCanvas.height = Math.round(img.naturalHeight * this.scale);

    // 4) pica resize
    await pica().resize(srcCanvas, destCanvas);

    // 5) exportar a Blob PNG
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
    this.step = "ready";
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
    this.fileInput.nativeElement.value = "";
    this.step = "select";
  }
}
