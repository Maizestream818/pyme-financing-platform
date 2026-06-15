import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaClientOrTransaction = PrismaService | Prisma.TransactionClient;

const PUBLIC_STATUSES: ApplicationStatus[] = [
  'draft',
  'documents_pending',
  'ready_for_analysis',
  'decision_published',
  'closed',
];

@Injectable()
export class StatusHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    params: {
      applicationId: string;
      previousStatus: ApplicationStatus | null;
      newStatus: ApplicationStatus;
      comment?: string | null;
      changedByUserId?: string | null;
    },
    client: PrismaClientOrTransaction = this.prisma,
  ) {
    return client.applicationStatusHistory.create({
      data: {
        applicationId: params.applicationId,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        comment: params.comment?.trim() || null,
        changedByUserId: params.changedByUserId ?? null,
      },
    });
  }

  async findForApplication(applicationId: string, user: AuthenticatedUser) {
    const application = await this.prisma.financingApplication.findFirst({
      where: {
        id: applicationId,
        ...(user.role === 'applicant'
          ? { company: { applicantUserId: user.id } }
          : {}),
      },
      select: { id: true },
    });

    if (!application) {
      throw new ApiException(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    }

    if (user.role === 'applicant') {
      const history = await this.prisma.applicationStatusHistory.findMany({
        where: {
          applicationId,
          newStatus: { in: PUBLIC_STATUSES },
        },
        orderBy: { changedAt: 'asc' },
      });

      return history.map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        previousStatus:
          item.previousStatus && PUBLIC_STATUSES.includes(item.previousStatus)
            ? item.previousStatus
            : null,
        newStatus: item.newStatus,
        changedAt: item.changedAt,
      }));
    }

    const history = await this.prisma.applicationStatusHistory.findMany({
      where: { applicationId },
      orderBy: { changedAt: 'asc' },
      include: {
        changedBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return history.map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      previousStatus: item.previousStatus,
      newStatus: item.newStatus,
      comment: item.comment,
      changedByUserId: item.changedByUserId,
      changedBy: item.changedBy,
      changedAt: item.changedAt,
      createdAt: item.createdAt,
    }));
  }
}
