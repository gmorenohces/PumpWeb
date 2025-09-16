import { Component, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { FormBuilder, Validators, ReactiveFormsModule } from "@angular/forms";

import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatChipsModule } from "@angular/material/chips";
import { MatSelectModule } from "@angular/material/select";
import { MatSliderModule } from "@angular/material/slider";
import { MatDividerModule } from "@angular/material/divider";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import {
  PRESETS,
  PresetKey,
  applyPresetsToPrompt,
} from "../../models/presets.model";
import {
  OpenAIService,
  ImageToImageReferenceRequest,
} from "../../services/openAI/open-ai.service";

type ModelKey = "openai" | "stability" | "getimg";

@Component({
  selector: "app-image-referencia",
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSelectModule,
    MatSliderModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: "./image-referencia.component.html",
  styleUrls: ["./image-referencia.component.css"],
})
export class ImageReferenciaComponent {
  private fb = inject(FormBuilder);
  private api = inject(OpenAIService);
  private snack = inject(MatSnackBar);

  // Banner
  bannerUrl = "/images/ban_images.png";
  bannerHeight = 250;

  // UI
  presets = PRESETS;
  modelOptions: { label: string; value: ModelKey }[] = [
    { label: "OpenAI", value: "openai" },
    { label: "Stability AI", value: "stability" },
    { label: "GetImg AI", value: "getimg" },
  ];
  aspectOptions = [
    { label: "1:1 Cuadrado", value: "1:1" },
    { label: "16:9 Horizontal", value: "16:9" },
    { label: "9:16 Vertical", value: "9:16" },
    { label: "4:5 Retrato", value: "4:5" },
  ];

  // Estado
  generating = signal(false);
  progress = signal(0);

  // Imagen de entrada / salida
  initFile = signal<File | null>(null);
  initPreview = signal<string | null>(null); // dataURL

  initFile_2 = signal<File | null>(null);
  initPreview_2 = signal<string | null>(null); // dataURL

  resultPreview = signal<string | null>(null); // url o dataURL

  // Form
  form = this.fb.group({
    prompt: ["", [Validators.required, Validators.minLength(5)]],
    negative: [""],
    model: ["openai" as ModelKey, Validators.required],
    aspect: ["1:1", Validators.required],
    cfg: this.fb.control(7),
    steps: this.fb.control(28),
    strength: this.fb.control(0.35),
    styles: this.fb.control<PresetKey | null>(null), // selección única
  });

  /** === Helpers de tamaño/ratio === */
  private getWH(aspect: string) {
    switch (aspect) {
      case "16:9":
        return { w: 1280, h: 720 };
      case "9:16":
        return { w: 720, h: 1280 };
      case "4:5":
        return { w: 1024, h: 1280 };
      default:
        return { w: 1024, h: 1024 };
    }
  }
  get aspectCss(): string {
    const a = this.form.controls.aspect.value ?? "1:1";
    switch (a) {
      case "16:9":
        return "16/9";
      case "9:16":
        return "9/16";
      case "4:5":
        return "4/5";
      default:
        return "1/1";
    }
  }

  /** === File helpers === */
  async onPickFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;
    const f = input.files[0];
    this.initFile.set(f);
    this.initPreview.set(await this.fileToDataURL(f));
  }
  clearInit() {
    this.initFile.set(null);
    this.initPreview.set(null);
  }

  async onPickFile_2(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;
    const f = input.files[0];
    this.initFile_2.set(f);
    this.initPreview_2.set(await this.fileToDataURL(f));
  }
  clearInit_2() {
    this.initFile_2.set(null);
    this.initPreview_2.set(null);
  }

  private fileToDataURL(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  /** === Build request para el service (usa `provider`) === */
  private buildRequest(): ImageToImageReferenceRequest {
    const v = this.form.getRawValue();
    const { w, h } = this.getWH(v.aspect!);

    // estilos: convertir selección única -> array para applyPresetsToPrompt
    const selected: PresetKey[] = v.styles ? ([v.styles] as PresetKey[]) : [];
    const finalPrompt = applyPresetsToPrompt(v.prompt ?? "", selected);

    // base64 de la imagen inicial (sin prefijo data:)
    const dataURL = this.initPreview()!;
    const dataURL_ref = this.initPreview_2()!;
    const init_b64 = dataURL.includes(",") ? dataURL.split(",")[1] : dataURL;
    const ref_b64 = dataURL_ref.includes(",")
      ? dataURL_ref.split(",")[1]
      : dataURL_ref;

    return {
      provider: v.model as ModelKey,
      prompt: finalPrompt,
      negative_prompt: v.negative || undefined,
      width: w,
      height: h,
      cfg_scale: Number(v.cfg ?? 7),
      steps: Number(v.steps ?? 28),
      strength: Number(v.strength ?? 0.35),
      init_image_b64: init_b64,
      ref_image_b64: ref_b64,
      output_format: "png",
    };
  }

  /** === Acción principal === */
  async generate() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snack.open("Escribe un prompt válido.", "OK", { duration: 2200 });
      return;
    }
    if (!this.initPreview()) {
      this.snack.open("Selecciona una imagen de entrada.", "OK", {
        duration: 2200,
      });
      return;
    }

    if (!this.initPreview_2()) {
      this.snack.open("Selecciona una imagen de referencia.", "OK", {
        duration: 2200,
      });
      return;
    }

    this.generating.set(true);
    this.progress.set(15);

    try {
      const url = await this.api.imageToImageReference(this.buildRequest());
      this.progress.set(85);
      this.resultPreview.set(url);
    } catch (err: any) {
      console.error(err);
      this.snack.open(err?.message ?? "Error generando imagen.", "OK", {
        duration: 2800,
      });
    } finally {
      this.generating.set(false);
      this.progress.set(100);
      setTimeout(() => this.progress.set(0), 600);
    }
  }

  downloadResult() {
    const src = this.resultPreview();
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `pump_img2img_${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.png`;
    a.click();
  }

  resetResult() {
    this.resultPreview.set(null);
    this.progress.set(0);
  }

  reset() {
    this.resetResult();
    this.resultPreview.set(null);
    this.form.patchValue({
      prompt: "",
      negative: "",
      model: "openai",
      aspect: "1:1",
      cfg: 7,
      steps: 28,
      strength: 0.35,
      styles: null,
    });
  }
}
