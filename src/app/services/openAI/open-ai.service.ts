import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom, Observable } from "rxjs";

import { environment } from "../../../environments/environment";

interface OpenAiResponse {
  data: { url: string }[];
}

/** Proveedor que usará el backend para rutear la petición a OpenAI, Stability o GetImg */
export type ProviderKey = "openai" | "gemini";
//export type ProviderKey = "openai" | "stability" | "getimg";

/** === TXT2IMG === */
export interface TextToImageRequest {
  /** Quién procesa en el back */
  provider: ProviderKey;

  /** Prompt positivo */
  prompt: string;

  /** Prompt negativo opcional */
  negative_prompt?: string;

  /** Resolución deseada */
  width: number;
  height: number;

  /** Parámetros de guía */
  cfg_scale: number; // 1..12 aprox
  steps: number; // 10..60 aprox

  /** Salida opcional (por defecto png) */
  output_format?: "png" | "jpeg" | "webp";
}

/** === IMG2IMG === */
export interface ImageToImageRequest {
  provider: ProviderKey;
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  cfg_scale: number;
  steps: number;

  /** Fuerza de transformación (0 = muy fiel a la imagen, 1 = muy creativo) */
  strength: number; // 0..1

  /** Imagen inicial en base64 SIN prefijo "data:image/...;base64," */
  init_image_b64: string;

  output_format?: "png" | "jpeg" | "webp";
}

/** === IMG2IMG === */
export interface ImageToImageReferenceRequest {
  provider: ProviderKey;
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  cfg_scale: number;
  steps: number;

  /** Fuerza de transformación (0 = muy fiel a la imagen, 1 = muy creativo) */
  strength: number; // 0..1

  /** Imagen inicial en base64 SIN prefijo "data:image/...;base64," */
  init_image_b64: string;
  ref_image_b64: string;
  output_format?: "png" | "jpeg" | "webp";
}

/** Respuesta estándar del backend */
interface AiResponse {
  /** El back puede devolver una URL pública... */
  url?: string;
  /** ...o la imagen en base64 (sin prefijo) */
  image_b64?: string;
  /** Mensaje de error (si aplica) */
  error?: string;
}

interface TiffConvertItem {
  name: string;
  data_url: string; // data:image/png;base64,...
}

@Injectable({
  providedIn: "root",
})
export class OpenAIService {
  private path = environment.apiUrl + "/users";
  private readonly _http = inject(HttpClient);

  /** ==================== TIFF → PNG ==================== */
  async convertTiffToPng(files: File[]): Promise<TiffConvertItem[]> {
    if (!files.length) return [];

    const fd = new FormData();
    for (const f of files) {
      fd.append("files", f, f.name);
    }
    console.log("Enviando archivos TIFF para conversión:", files);

    // Ajusta el endpoint si en tu back usas otro path
    const endpoint = `${this.path}/convert-tiff`;

    const res = await firstValueFrom(
      this._http.post<TiffConvertItem[]>(endpoint, fd)
    );

    return res || [];
  }

  sendImageForOutpainting(
    blob: Blob,
    filename: string,
    outpaint_by: string,
    recortar: { L: boolean; D: boolean; S: boolean; I: boolean },
    targetW: number,
    targetH: number,
    crop: {
      L0: number;
      D0: number;
      S0: number;
      I0: number;
      cropped_input: boolean;
    }
  ): Observable<Blob> {
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("outpaint_by", outpaint_by);
    formData.append("recortar", JSON.stringify(recortar));
    formData.append("target_w", String(targetW));
    formData.append("target_h", String(targetH));
    formData.append("crop_l", String(crop.L0));
    formData.append("crop_d", String(crop.D0));
    formData.append("crop_s", String(crop.S0));
    formData.append("crop_i", String(crop.I0));
    formData.append("cropped_input", crop.cropped_input ? "1" : "0");

    return this._http.post(`${this.path}/outpainting`, formData, {
      responseType: "blob",
    });
  }

  /** 1) Generar imágenes nuevas desde un prompt */
  generate(prompt: string, n = 1): Observable<OpenAiResponse> {
    return this._http.post<OpenAiResponse>(`${this.path}/generate`, {
      prompt,
      n,
    });
  }

  /** 2) Editar una imagen existente con un prompt y máscara */
  edit(
    imageData: string, // data:image/png;base64,…
    maskData: string | null, // igual que imageData o null
    prompt: string
  ): Observable<OpenAiResponse> {
    return this._http.post<OpenAiResponse>(`${this.path}/edit`, {
      image: imageData,
      mask: maskData,
      prompt,
      n: 1,
    });
  }

  /** 3) Variaciones de una imagen existente */
  variation(imageData: string, n = 1): Observable<OpenAiResponse> {
    return this._http.post<OpenAiResponse>(`${this.path}/variation`, {
      image: imageData,
      n,
    });
  }

  /** ==================== TXT2IMG ==================== */
  async textToImage(body: TextToImageRequest): Promise<string> {
    return this._postAndResolve(`${this.path}/generate/txt2img`, body);
  }
  /** Alias por si en alguna parte ya usas este nombre */
  async txt2img(body: TextToImageRequest): Promise<string> {
    return this.textToImage(body);
  }

  /** ==================== IMG2IMG ==================== */
  async imageToImage(body: ImageToImageRequest): Promise<string> {
    return this._postAndResolve(`${this.path}/generate/img2img`, body);
  }
  /** Alias */
  async img2img(body: ImageToImageRequest): Promise<string> {
    return this.imageToImage(body);
  }

  async imageToImageReference(
    body: ImageToImageReferenceRequest
  ): Promise<string> {
    return this._postAndResolve(`${this.path}/generate/img2imgref`, body);
  }

  async img2imgref(body: ImageToImageReferenceRequest): Promise<string> {
    return this.imageToImageReference(body);
  }

  /** ==================== Utils ==================== */

  /**
   * Envía al endpoint, valida y devuelve un **data URL** listo para `<img src>`.
   * Si el back responde `url`, la devuelve tal cual; si responde `image_b64`, se arma el dataURL.
   */
  private async _postAndResolve(
    endpoint: string,
    payload: any
  ): Promise<string> {
    const res = await firstValueFrom(
      this._http.post<AiResponse>(endpoint, payload)
    );

    if (res?.error) {
      throw new Error(res.error);
    }
    if (res?.url) {
      return res.url; // URL servida por tu backend (/media/xxx.png, s3, etc)
    }
    if (res?.image_b64) {
      // Asumimos PNG si no nos dicen lo contrario
      return `data:image/png;base64,${res.image_b64}`;
    }
    throw new Error("Respuesta inválida del servidor.");
  }

  /** Convertir un File a base64 (SIN el prefijo data:) si alguna vez lo necesitas en el front */
  async fileToBase64NoPrefix(file: File): Promise<string> {
    const dataUrl = await this.fileToDataURL(file);
    return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  }

  /** Convertir un File a dataURL (con prefijo) */
  fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
}
