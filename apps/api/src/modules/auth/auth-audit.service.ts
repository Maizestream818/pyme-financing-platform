import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export type AuditContext = {
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuthAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    action: AuditAction;
    entityName: string;
    entityId?: string;
    newValues?: Prisma.InputJsonValue;
    context?: AuditContext;
  }) {
    await this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityName: params.entityName,
        entityId: params.entityId,
        newValues: params.newValues,
        ipAddress: params.context?.ipAddress,
        userAgent: params.context?.userAgent,
      },
    });
  }
}
