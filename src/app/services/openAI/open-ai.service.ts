import { inject, Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

import { environment } from "../../../environments/environment";

interface OpenAiResponse {
  data: { url: string }[];
}

@Injectable({
  providedIn: "root",
})
export class OpenAIService {
  private path = environment.apiUrl + "/users";
  private readonly _http = inject(HttpClient);

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
}
