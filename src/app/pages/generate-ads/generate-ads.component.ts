import { CommonModule } from "@angular/common";
import { Component, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSelectModule } from "@angular/material/select";
import { ConvertService } from "../../services/convert/convert.service";

@Component({
  selector: "app-generate-ads",
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
  templateUrl: "./generate-ads.component.html",
  styleUrl: "./generate-ads.component.css",
})
export class GenerateAdsComponent {
  bannerUrl = "/images/banner_format.png";
  bannerHeight = 250;
  referenceFile: File | null = null;
  step = "reference";
  referenceUrl = "";
  imagesRefFiles: File[] = [];
  imagesRefUrls: string[] = [];
  imagesRefError: string | null = null;

  mode16x9: "Izquierda" | "Derecha" | "Simetrico" = "Simetrico";
  mode9x16: "Superior" | "Inferior" | "Simetrico" = "Simetrico";
  rounding: "floor" | "ceil" = "floor";

  generating = signal(false);
  out16x9Url: string | null = null;
  out9x16Url: string | null = null;

  errorMessage: string | null = null;

  promptText = ""; // puedes poner un valor por defecto aquí
  negativePromptText =
    "texto, watermark, logos extra, artefactos, blur, baja resolución, duplicar objeto, distorsión";

  constructor(private convertService: ConvertService) {}

  onImagesSelected(evt: Event) {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    // filtra tipos válidos
    const images = files.filter((f) => /image\/(png|jpeg|webp)/.test(f.type));

    // valida 1..3
    if (images.length === 0) {
      this.imagesRefError = "Selecciona al menos 1 imagen (png/jpg/webp).";
      return;
    }
    if (images.length > 3) {
      this.imagesRefError = "Máximo 3 imágenes. Se usarán las 3 primeras.";
    } else {
      this.imagesRefError = null;
    }

    const limited = images.slice(0, 3);

    // limpia URLs previas
    this.imagesRefUrls.forEach((u) => URL.revokeObjectURL(u));

    // setea estado
    this.imagesRefFiles = limited;
    this.imagesRefUrls = limited.map((f) => URL.createObjectURL(f));

    // si manejas steps, podrías avanzar aquí
    // this.step = 'images_reference';
  }

  removeImageRef(i: number) {
    const url = this.imagesRefUrls[i];
    if (url) URL.revokeObjectURL(url);
    this.imagesRefUrls.splice(i, 1);
    this.imagesRefFiles.splice(i, 1);
    this.imagesRefUrls = [...this.imagesRefUrls]; // refresca vista
  }

  ngOnDestroy(): void {
    if (this.referenceUrl) URL.revokeObjectURL(this.referenceUrl);
    this.imagesRefUrls.forEach((u) => URL.revokeObjectURL(u));
  }

  /** Se dispara al cargar la imagen de referencia */
  async onReferenceSelected(evt: Event): Promise<void> {
    const input = evt.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const url = URL.createObjectURL(file);

    // --- Verificar dimensiones ---
    const img = new Image();
    img.src = url;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        const { width, height } = img;
        const isSquare = width === height;
        const ratio = width / height;

        const is1024Square = width === 1024 && height === 1024;
        const isSquare1024Plus = isSquare && width >= 1024 && height >= 1024;
        const isRatio1to1From1024 =
          Math.abs(ratio - 1) < 0.01 && width >= 1024 && height >= 1024;

        if (is1024Square || isSquare1024Plus || isRatio1to1From1024) {
          // ✅ Cumple las condiciones
          this.referenceFile = file;
          this.referenceUrl = url;
          resolve();
        } else {
          // ❌ No cumple → limpiar
          URL.revokeObjectURL(url);
          this.referenceFile = null;
          this.referenceUrl = "";
          alert(
            "La imagen debe ser 1024x1024 o mantener relación 1:1 con mínimo 1024 px."
          );
          reject();
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo cargar la imagen."));
      };
    });
  }

  async nextStep(stepValue: any) {
    this.step = stepValue;
  }

  async generateAds() {
    console.log("Generando anuncios con prompt:");

    if (!this.referenceFile || this.imagesRefFiles.length == 0) return;
    console.log("Generando anuncios con prompt_2:");
    this.generating.set(true);
    try {
      const { ad16x9, ad9x16 } = await this.convertService.generateAds({
        image: this.referenceFile,
        mode16x9: this.mode16x9, // 'Izquierda' | 'Derecha' | 'Simetrico'
        mode9x16: this.mode9x16, // 'Superior' | 'Inferior' | 'Simetrico'
        rounding: "floor",
        output_format: "webp",
        //prompt: this.promptText,         // 👈 se envía al back
        //negative_prompt: this.negativePromptText, // 👈 también
        refs: this.imagesRefFiles, // opcional
      });
      this.out16x9Url = ad16x9;
      this.out9x16Url = ad9x16;
      console.log("Generando anuncios con prompt_3:");
    } finally {
      this.generating.set(false);
      console.log("Generando anuncios con prompt_4:");
    }
  }
}
