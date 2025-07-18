import { HttpClient, HttpEvent, HttpParams, HttpResponse } from "@angular/common/http";
import { inject, Injectable } from "@angular/core";
import { map, Observable } from "rxjs";
import { environment } from "../../../environments/environment";

@Injectable({
  providedIn: "root",
})
export class DataService {
  private path = environment.apiUrl + "/users";
  private readonly _http = inject(HttpClient);

  uploadImages(params: any) {
    return this._http.post<any>(`${this.path}/uploadImages`, params);
  }

  frameImages(form: FormData): Observable<HttpEvent<Blob>> {
    return this._http.post(`${this.path}/format`, form, {
      reportProgress: true,
      observe: "events",
      responseType: "blob",
    });
  }

  downloadZip() {
    return this._http.get<any>(`${this.path}/downloadZip`);
  }

  
  outpaint(form: FormData): Observable<Blob> {
    const url = `${this.path}/outpaint`;
    return this._http.post(url, form, {
      responseType: 'blob',
      observe: 'response'
    }).pipe(
      // extraer sólo el body (Blob) de la respuesta HttpResponse
      map((res: HttpResponse<Blob>) => {
        if (!res.body) throw new Error('No content in response');
        return res.body;
      })
    );
  }

  // process(ids: number[]) {
  //   return this._http.post<any>(`${this.path}/process`, ids);
  // }

  // getDataPdfs(date?: string, status?: string): Observable<DataPdfsResponse> {
  //   let params = new HttpParams();
  //   if (date) params = params.set('date', date);
  //   if (status) params = params.set('status', status);

  //   return this._http.get<DataPdfsResponse>(`${this.path}/getData`, { params });
  // }

  // getDataPdfsById(id: number): Observable<DataPdfsResponse> {
  //   // Llama a tu endpoint GET /users/getDataById/:id
  //   return this._http.get<DataPdfsResponse>(`${this.path}/getDataById/${id}`);
  // }

  // updatePdf(id: number, data: Partial<DataPdf>): Observable<DataPdf> {
  //   return this._http.put<DataPdf>(`${this.path}/updatePdf/${id}`, data);
  // }

  // getAuditedPdfs(): Observable<DataPdfsResponse> {
  //   // Usamos tu endpoint existente /getData/<date>/<status>
  //   // fecha vacía + status
  //   return this._http.get<DataPdfsResponse>(
  //     `${this.path}/getDataAudited`
  //   );
  // }
}
