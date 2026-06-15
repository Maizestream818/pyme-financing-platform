import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../filters/api.exception';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

type JwtPayload = {
  sub?: string;
};

type RequestWithUser = {
  headers?: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new ApiException(
        401,
        'UNAUTHORIZED',
        'Token de autenticacion requerido.',
      );
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new ApiException(401, 'UNAUTHORIZED', 'Token invalido o expirado.');
    }

    if (!payload.sub) {
      throw new ApiException(401, 'UNAUTHORIZED', 'Token invalido o expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.isActive || !user.role.isActive) {
      throw new ApiException(401, 'UNAUTHORIZED', 'Usuario no autorizado.');
    }

    request.user = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role.name,
    };

    return true;
  }

  private extractToken(request: RequestWithUser): string | undefined {
    const authorization = request.headers?.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;

    if (!value) {
      return undefined;
    }

    const [type, token] = value.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
