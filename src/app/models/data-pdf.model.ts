// src/app/models/data-pdf.model.ts

/**
 * Interfaz que representa la estructura de un DataPdf según la respuesta del backend.
 */
export interface DataPdf {
  id: number;
  user_id: number;
  file_name: string;
  file_data: string;
  status: 'UPLOADED' | 'PROCESSED' | 'ERROR' | string;
  created: string | Date;
  updated: string | Date;
  page: number;
  name: string | null;
  identification: string | null;
  type_identification: string | null;
  phone: string | null;
  email: string | null;
  grade: string | null;
  school: string | null;
  calendary: string | null;
  city: string | null;
  undergraduate: string | null;
  postgraduate: string | null;
  social_media: string | null;
  signature: string | null;
}

/**
 * Estructura envolvente que devuelve el endpoint:
 * { dataPdfs: DataPdf[] }
 */
export interface DataPdfsResponse {
  dataPdfs: DataPdf[];
}
