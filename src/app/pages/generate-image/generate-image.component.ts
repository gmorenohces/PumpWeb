import {
  Component,
  signal,
  inject,
  HostListener,
  ViewChild,
  ElementRef,
} from "@angular/core";
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
  ImageToImageRequest,
} from "../../services/openAI/open-ai.service";

type ModelKey = "openai" | "gemini";

@Component({
  selector: "app-generate-image",
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
  templateUrl: "./generate-image.component.html",
  styleUrls: ["./generate-image.component.css"],
})
export class GenerateImageComponent {
  private fb = inject(FormBuilder);
  private api = inject(OpenAIService);
  private snack = inject(MatSnackBar);
  @ViewChild("fileInput", { static: false })
  fileInputRef!: ElementRef<HTMLInputElement>;

  // Banner
  bannerUrl = "/images/ban_images.png";
  bannerHeight = 250;

  isDragOver = false;

  // UI
  presets = PRESETS;
  modelOptions: { label: string; value: ModelKey }[] = [
    { label: "OpenAI", value: "openai" },
    { label: "Google", value: "gemini" },
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
  resultPreview = signal<string | null>(null); // url o dataURL
  initUrl?: string;

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

  @HostListener("window:dragover", ["$event"])
  @HostListener("window:drop", ["$event"])
  preventWindowDrop(e: DragEvent) {
    e.preventDefault();
  }

  // --- Handlers de drag & drop sobre la stage ---
  onDragEnter(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = true;
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
  }

  onDragLeave(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = false;
  }

  async onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragOver = false;

    const dt = e.dataTransfer;
    if (!dt) return;

    let files: File[] = Array.from(dt.files || []).filter((f) =>
      f.type.startsWith("image/")
    );
    if (files.length === 0 && dt.items) {
      const items = Array.from(dt.items);
      for (const it of items) {
        const f = it.getAsFile();
        if (
          f &&
          (f.type.startsWith("image/") ||
            /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(f.name))
        ) {
          files.push(f);
        }
      }
    }
    if (!files.length) return;

    const first = files[0];
    this.initFile.set(first);
    this.initPreview.set(await this.fileToDataURL(first));

    // Limpia el input escondido por si luego abren el diálogo y eligen el mismo archivo
    try {
      this.fileInputRef?.nativeElement &&
        (this.fileInputRef.nativeElement.value = "");
    } catch {}
  }

  /** Crea un FileList real a partir de un array de File */
  private toFileList(files: File[]): FileList {
    const data = new DataTransfer();
    files.forEach((f) => data.items.add(f));
    return data.files;
  }

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
    const f = input.files && input.files[0];
    if (!f) return;

    // Setea señales
    this.initFile.set(f);
    this.initPreview.set(await this.fileToDataURL(f));

    try {
      input.value = "";
    } catch {}
  }

  clearInit() {
    this.initFile.set(null);
    this.initPreview.set(null);

    // Limpia también el input (evita que quede “pegado” el último archivo)
    try {
      this.fileInputRef?.nativeElement &&
        (this.fileInputRef.nativeElement.value = "");
    } catch {}
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
  private buildRequest(): ImageToImageRequest {
    const v = this.form.getRawValue();
    const { w, h } = this.getWH(v.aspect!);

    // estilos: convertir selección única -> array para applyPresetsToPrompt
    const selected: PresetKey[] = v.styles ? ([v.styles] as PresetKey[]) : [];
    const finalPrompt = applyPresetsToPrompt(v.prompt ?? "", selected);

    // base64 de la imagen inicial (sin prefijo data:)
    const dataURL = this.initPreview()!;
    const init_b64 = dataURL.includes(",") ? dataURL.split(",")[1] : dataURL;

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

    this.generating.set(true);
    this.progress.set(15);

    try {
      const url = await this.api.imageToImage(this.buildRequest());
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
