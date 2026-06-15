import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY, RoleName } from '../decorators/roles.decorator';
import { ApiException } from '../filters/api.exception';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleName[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      throw new ApiException(
        401,
        'UNAUTHORIZED',
        'Token de autenticacion requerido.',
      );
    }

    if (!requiredRoles.includes(request.user.role as RoleName)) {
      throw new ApiException(
        403,
        'FORBIDDEN',
        'No tienes permisos para ejecutar esta accion.',
      );
    }

    return true;
  }
}
