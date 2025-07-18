import { CommonModule } from "@angular/common";
import { Component, ElementRef, ViewChild } from "@angular/core";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { DataService } from "../../services/data/data.service";
import { ConvertService } from "../../services/convert/convert.service";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { HttpEventType } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";

import JSZip from "jszip";
import { saveAs } from "file-saver";

type Step = "select" | "ready" | "processing" | "done";

@Component({
  selector: "app-format",
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
  ],
  templateUrl: "./format.component.html",
  styleUrl: "./format.component.css",
})
export class FormatComponent {
  @ViewChild("fileInput") fileInput!: ElementRef<HTMLInputElement>;

  bannerUrl = "/images/banner_format.png";
  bannerHeight = 250;

  step: Step = "select";
  selectedFiles: File[] = [];
  convertedBlobs: Blob[] = [];
  errorMessage = "";
  progress = 0;
  /** Nivel de calidad entre 0.1 y 1.0 */
  quality = 0.9;

  // formatos disponibles
  formats = [
    { value: "all", viewValue: "Todos" },
    { value: "1:1", viewValue: "Square 1:1" },
    { value: "9:16", viewValue: "Vertical 9:16" },
    { value: "16:9", viewValue: "Horizontal 16:9" },
    { value: "story", viewValue: "Stories" },
    { value: "banner", viewValue: "Banner" },
  ];

  selectedFormat = this.formats[0].value;

  constructor(
    private dataService: DataService,
    private convertService: ConvertService
  ) {}

  get canStart(): boolean {
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

  /** Inicia subida + conversión vía backend */
  // ...
  uploadFiles() {
    const form = new FormData();
    this.selectedFiles.forEach((f) => form.append("images", f, f.name));
    form.append("format", this.selectedFormat);

    this.dataService.frameImages(form).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progress = Math.round((event.loaded / event.total) * 100);
        } else if (event.type === HttpEventType.Response) {
          saveAs(event.body!, "formatos.zip");
          this.reset();
        }
      },
      error: () => {
        this.errorMessage = "Error en el servidor";
        this.step = "select";
      },
    });
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
    const zip = new JSZip();
    // Para cada blob convertido, lo agrego al zip
    this.convertedBlobs.forEach((blob, idx) => {
      // nombre base sin extensión
      const base = this.selectedFiles[idx].name.replace(/\.\w+$/, "");
      // agrego un sufijo según el formato elegido
      const name = `${base}_${this.selectedFormat}.png`;
      zip.file(name, blob);
    });
    // genero el zip y lo descargo en un sólo archivo
    zip.generateAsync({ type: "blob" }).then((content) => {
      saveAs(content, "formatos.zip");
      this.reset();
    });
  }
}
