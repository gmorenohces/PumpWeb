import { firstValueFrom } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { Router } from "@angular/router";
import { environment } from "../../../environments/environment";

type Mode16x9ES = "Izquierda" | "Derecha" | "Simetrico";
type Mode9x16ES = "Superior" | "Inferior" | "Simetrico";

@Injectable({
  providedIn: "root",
})
export class ConvertService {
  private path = environment.apiUrl + "/users";
  private readonly _http = inject(HttpClient);
  private router = inject(Router);
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
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se generó el Blob WebP"));
        },
        "image/webp",
        quality
      );
    });
  }

  private map16x9Es(
    m: "Izquierda" | "Derecha" | "Simetrico"
  ): "left-only" | "right-only" | "symmetric-horizontal" {
    if (m === "Izquierda") return "left-only";
    if (m === "Derecha") return "right-only";
    return "symmetric-horizontal";
  }

  private map9x16Es(
    m: "Superior" | "Inferior" | "Simetrico"
  ): "top-only" | "bottom-only" | "symmetric-vertical" {
    if (m === "Superior") return "top-only";
    if (m === "Inferior") return "bottom-only";
    return "symmetric-vertical";
  }

  async generateAds(opts: {
    image: File; // base 1:1 (≥1080)
    mode16x9: Mode16x9ES; // Izquierda | Derecha | Simetrico
    mode9x16: Mode9x16ES; // Superior | Inferior | Simetrico
    rounding?: "floor" | "ceil"; // por defecto floor (1024→1820)
    output_format?: "webp" | "png";
    prompt?: string;
    negative_prompt?: string;
    refs?: File[]; // opcional (las enviamos pero el back puede ignorarlas)
  }): Promise<{ ad16x9: string; ad9x16: string; margins: any }> {
    const fd = new FormData();
    fd.append("image", opts.image);
    fd.append("mode16x9", this.map16x9Es(opts.mode16x9));
    fd.append("mode9x16", this.map9x16Es(opts.mode9x16));
    fd.append("rounding", opts.rounding ?? "floor");
    fd.append("output_format", opts.output_format ?? "webp");
    if (opts.prompt) fd.append("prompt", opts.prompt);
    if (opts.negative_prompt)
      fd.append("negative_prompt", opts.negative_prompt);
    (opts.refs ?? []).slice(0, 3).forEach((r) => fd.append("refs", r)); // opcional

    const url = `${this.path}/outpaint/ads`;
    const res = await firstValueFrom(this._http.post<any>(url, fd));
    return { ad16x9: res.ad16x9, ad9x16: res.ad9x16, margins: res.margins };
  }
}
