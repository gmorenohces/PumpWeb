import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { UsersService } from '../services/users/users.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  constructor(private router: Router, private authService: UsersService) {}
  identification = '';
  password = '';
  showPassword = false;
  TOKEN_KEY = 'auth_token';
  loginInvalid = false;
  errorMessage: string | null = null;

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  onLogin() {
    this.authService
      .login({ identification: this.identification, password: this.password })
      .subscribe({
        next: (data: any) => {
          console.log('data is: ', data);
          if (data) {
            localStorage.setItem(this.TOKEN_KEY, JSON.stringify(data));
            this.router.navigate(['/home']);
          } else {
            this.errorMessage = 'Identificación o contraseña inválidos';
          }
        },
        error: (err: any) => {
          this.errorMessage =
            err.error?.message || 'Identificación o contraseña inválidos';
        },
      });
  }
}
