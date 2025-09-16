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
import { MatExpansionModule } from "@angular/material/expansion";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";

import {
  PRESETS,
  PresetKey,
  applyPresetsToPrompt,
} from "../../models/presets.model";

import {
  OpenAIService,
  TextToImageRequest,
} from "../../services/openAI/open-ai.service";

/** Igual que en el service (union para el provider) */
type ModelKey = "openai" | "stability" | "getimg";

@Component({
  selector: "app-text-image",
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
    MatExpansionModule,
    MatSnackBarModule,
  ],
  templateUrl: "./text-image.component.html",
  styleUrls: ["./text-image.component.css"],
})
export class TextImageComponent {
  private fb = inject(FormBuilder);
  private api = inject(OpenAIService);
  private snack = inject(MatSnackBar);

  // banner
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
  ];

  // Estado
  generating = signal(false);
  progress = signal(0);
  previewSrc = signal<string | null>(null);
  history = signal<string[]>([]);

  // Form
  form = this.fb.group({
    prompt: ["", [Validators.required, Validators.minLength(5)]],
    negative: [""],
    model: ["openai" as ModelKey, Validators.required],
    aspect: ["1:1", Validators.required],
    styles: this.fb.control<PresetKey | null>(null),
    cfg: this.fb.control(7),
    steps: this.fb.control(28),
    seed: this.fb.control<number | null>(null),
  });

  /** ===== Helpers ratio y tamaño ===== */
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

  /** Construye el payload que espera el service NUEVO (usa `provider`) */
  private buildRequest(): TextToImageRequest {
    const v = this.form.getRawValue();
    const { w, h } = this.getWH(v.aspect!);
    const selected: PresetKey[] = v.styles ? ([v.styles] as PresetKey[]) : [];
    const finalPrompt = applyPresetsToPrompt(v.prompt ?? "", selected);

    return {
      provider: v.model as ModelKey, // 👈 ahora se llama provider
      prompt: finalPrompt,
      negative_prompt: v.negative || undefined,
      width: w,
      height: h,
      cfg_scale: Number(v.cfg ?? 7),
      steps: Number(v.steps ?? 28),
      output_format: "png",
    };
  }

  /** ====== Acción principal (async/await porque el service devuelve Promise) ====== */
  async generate() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snack.open("Escribe un prompt válido.", "OK", { duration: 2000 });
      return;
    }

    this.generating.set(true);
    this.progress.set(15);

    try {
      const url = await this.api.textToImage(this.buildRequest());
      this.progress.set(85);
      this.previewSrc.set(url);
      this.history.update((h) => [url, ...h].slice(0, 12));
    } catch (err: any) {
      console.error(err);
      this.snack.open(err?.message ?? "Error generando imagen.", "OK", {
        duration: 2500,
      });
    } finally {
      this.generating.set(false);
      this.progress.set(100);
      setTimeout(() => this.progress.set(0), 600);
    }
  }

  download() {
    const src = this.previewSrc();
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = `pump_${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    a.click();
  }

  reset() {
    this.form.reset({
      prompt: "",
      negative: "",
      model: "openai",
      aspect: "1:1",
      styles: null,
      cfg: 7,
      steps: 28,
      seed: null,
    });
    this.previewSrc.set(null);
  }

  clearPrompt() {
    this.form.controls.prompt.setValue("");
  }
}
