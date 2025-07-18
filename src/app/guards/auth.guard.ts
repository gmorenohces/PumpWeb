import { CanActivateFn, Router } from '@angular/router';
import { UsersService } from '../services/users/users.service';
import { inject } from '@angular/core';

export const authGuard: CanActivateFn = () => {
  const authService = inject(UsersService);
  const router = inject(Router);

  if(!authService.isLoggedIn()){
    router.navigate(['/login']);
    return false;
  }
  return true;
};
