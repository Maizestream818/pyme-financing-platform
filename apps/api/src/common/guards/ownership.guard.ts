import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ApiException } from '../filters/api.exception';
import { PrismaService } from '../prisma/prisma.service';

type OwnershipResource = 'company' | 'application';

type OwnershipConfig = {
  resource: OwnershipResource;
  param: string;
};

export const OWNERSHIP_KEY = 'ownership';

export const Ownership = (resource: OwnershipResource, param = 'id') =>
  SetMetadata(OWNERSHIP_KEY, { resource, param } satisfies OwnershipConfig);

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = this.reflector.getAllAndOverride<OwnershipConfig>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser; params?: Record<string, string> }>();
    const user = request.user;

    if (!user) {
      throw new ApiException(
        401,
        'UNAUTHORIZED',
        'Token de autenticacion requerido.',
      );
    }

    if (user.role === 'internal_operator') {
      return true;
    }

    const resourceId = request.params?.[config.param];

    if (!resourceId) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El identificador del recurso es requerido.',
        [{ field: config.param, issue: 'required' }],
      );
    }

    const isOwner =
      config.resource === 'company'
        ? await this.userOwnsCompany(user.id, resourceId)
        : await this.userOwnsApplication(user.id, resourceId);

    if (!isOwner) {
      throw new ApiException(
        403,
        'FORBIDDEN',
        'No tienes permisos para acceder a este recurso.',
      );
    }

    return true;
  }

  private async userOwnsCompany(userId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        applicantUserId: userId,
      },
      select: { id: true },
    });

    return Boolean(company);
  }

  private async userOwnsApplication(userId: string, applicationId: string) {
    const application = await this.prisma.financingApplication.findFirst({
      where: {
        id: applicationId,
        company: {
          applicantUserId: userId,
        },
      },
      select: { id: true },
    });

    return Boolean(application);
  }
}
