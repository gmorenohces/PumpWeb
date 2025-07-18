import { CommonModule } from "@angular/common";
import { Component, ElementRef, Input, ViewChild } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { DataService } from "../../services/data/data.service";
import { ConvertService } from "../../services/convert/convert.service";
import { MatProgressBarModule } from "@angular/material/progress-bar";

type Step = "select" | "ready" | "processing" | "done";

@Component({
  selector: "app-webp",
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: "./webp.component.html",
  styleUrls: ["./webp.component.css"],
})
export class WebpComponent {
  @ViewChild("fileInput") fileInput!: ElementRef<HTMLInputElement>;

  bannerUrl = "/images/bg_webp.png";
  bannerHeight = 250;

  step: Step = "select";
  selectedFiles: File[] = [];
  convertedBlobs: Blob[] = [];
  errorMessage = "";
  progress = 0;
  /** Nivel de calidad entre 0.1 y 1.0 */
  quality = 0.9;

  constructor(
    private dataService: DataService,
    private convertService: ConvertService
  ) {}

  get canConvert() {
    return this.selectedFiles.length > 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onFilesSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) {
      this.step = "select";
      return;
    }
    this.selectedFiles = Array.from(input.files);
    // avanzar al estado "ready" para mostrar botones Cancelar/Convertir
    this.step = "ready";
    this.convertedBlobs = [];
  }

  /** Cancelar selección y volver al inicio */
  cancelSelection() {
    this.selectedFiles = [];
    this.fileInput.nativeElement.value = "";
    this.step = "select";
    this.errorMessage = "";
  }

  /** Inicia subida + conversión */
  async uploadFiles() {
    this.errorMessage = "";
    this.step = "processing";
    this.progress = 0;
    this.convertedBlobs = [];
    const start = performance.now();
    try {
      // 1) Convertir cada imagen a WebP en cliente
      for (let i = 0; i < this.selectedFiles.length; i++) {
        const blob = await this.convertService.convertToWebP(
          this.selectedFiles[i],
          this.quality
        );
        this.convertedBlobs.push(blob);
        // actualizar progreso de conversión local (antes de la subida)
        this.progress = Math.round(((i + 1) / this.selectedFiles.length) * 100);
      }
      const elapsed = performance.now() - start;
      const minimum = 1000; // ms
      if (elapsed < minimum) {
        await this.delay(minimum - elapsed);
      }
      this.step = "done";
      this.progress = 100;
    } catch (err: any) {
      console.error(err);
      this.errorMessage = err?.message || "Error en el proceso";
      this.step = "select";
    }
  }

  reset() {
    this.selectedFiles = [];
    this.convertedBlobs = [];
    this.fileInput.nativeElement.value = "";
    this.step = "select";
    this.errorMessage = "";
    this.progress = 0;
  }

  download() {
    // descarga todos los Blobs convertidos uno a uno
    this.convertedBlobs.forEach((blob, idx) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = this.selectedFiles[idx].name.replace(/\.\w+$/, ".webp");
      a.click();
      URL.revokeObjectURL(url);
    });
    this.reset();
  }
}
