import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private readonly TOKEN_KEY = 'auth_token';
  private path = environment.apiUrl + '/users';
  private readonly _http = inject(HttpClient);
  private router = inject(Router);

  login(params: any) {
    return this._http.post<any>(`${this.path}/logging`, params);
  }

  isLoggedIn() {
    return localStorage.getItem(this.TOKEN_KEY) != null;
  }

  getUser() {
    const user = localStorage.getItem(this.TOKEN_KEY);
    if (user) {
      return JSON.parse(user);
    }
    return null;
  }
}
