import { Injectable } from '@nestjs/common';
import { ApplicationStatus, BusinessType, Company, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const LOCKED_APPLICATION_STATUSES: ApplicationStatus[] = [
  'ready_for_analysis',
  'analyzed',
  'matched',
  'decision_published',
  'closed',
];

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser) {
    const companies = await this.prisma.company.findMany({
      where:
        user.role === 'applicant' ? { applicantUserId: user.id } : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return companies.map((company) => this.toResponse(company, user));
  }

  async create(dto: CreateCompanyDto, user: AuthenticatedUser) {
    const rfc = this.normalizeRfc(dto.rfc);
    this.validateRfcForBusinessType(rfc, dto.businessType);

    await this.ensureRfcIsAvailable(rfc);

    const applicantUserId =
      user.role === 'applicant'
        ? user.id
        : await this.resolveApplicantUserId(dto.applicantUserId);

    const company = await this.prisma.company.create({
      data: {
        legalName: dto.legalName.trim(),
        tradeName: this.optionalTrim(dto.tradeName),
        rfc,
        businessType: dto.businessType,
        sector: dto.sector.trim(),
        yearsOperating: new Prisma.Decimal(dto.yearsOperating),
        monthlyRevenue: new Prisma.Decimal(dto.monthlyRevenue),
        monthlyExpenses: new Prisma.Decimal(dto.monthlyExpenses),
        employeeCount: dto.employeeCount,
        contactEmail: this.optionalTrim(dto.contactEmail),
        contactPhone: this.optionalTrim(dto.contactPhone),
        applicantUserId,
        createdByUserId: user.id,
      } satisfies Prisma.CompanyUncheckedCreateInput,
    });

    return this.toResponse(company, user);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const company = await this.findAccessibleCompany(id, user);

    return this.toResponse(company, user);
  }

  async update(id: string, dto: UpdateCompanyDto, user: AuthenticatedUser) {
    const current = await this.findAccessibleCompany(id, user);

    if (user.role === 'applicant') {
      await this.ensureApplicantCanEditCompany(id);
    }

    const businessType = dto.businessType ?? current.businessType;
    const rfc = dto.rfc ? this.normalizeRfc(dto.rfc) : current.rfc;
    this.validateRfcForBusinessType(rfc, businessType);

    if (rfc !== current.rfc) {
      await this.ensureRfcIsAvailable(rfc, id);
    }

    const data: Prisma.CompanyUncheckedUpdateInput = {
      legalName:
        dto.legalName === undefined ? undefined : dto.legalName.trim(),
      tradeName:
        dto.tradeName === undefined ? undefined : this.optionalTrim(dto.tradeName),
      rfc: dto.rfc === undefined ? undefined : rfc,
      businessType: dto.businessType,
      sector: dto.sector === undefined ? undefined : dto.sector.trim(),
      yearsOperating:
        dto.yearsOperating === undefined
          ? undefined
          : new Prisma.Decimal(dto.yearsOperating),
      monthlyRevenue:
        dto.monthlyRevenue === undefined
          ? undefined
          : new Prisma.Decimal(dto.monthlyRevenue),
      monthlyExpenses:
        dto.monthlyExpenses === undefined
          ? undefined
          : new Prisma.Decimal(dto.monthlyExpenses),
      employeeCount: dto.employeeCount,
      contactEmail:
        dto.contactEmail === undefined
          ? undefined
          : this.optionalTrim(dto.contactEmail),
      contactPhone:
        dto.contactPhone === undefined
          ? undefined
          : this.optionalTrim(dto.contactPhone),
    };

    if (user.role === 'internal_operator' && dto.applicantUserId !== undefined) {
      data.applicantUserId = await this.resolveApplicantUserId(
        dto.applicantUserId ?? undefined,
      );
    }

    const company = await this.prisma.company.update({
      where: { id },
      data,
    });

    return this.toResponse(company, user);
  }

  async findApplications(id: string, user: AuthenticatedUser) {
    await this.findAccessibleCompany(id, user);

    const applications = await this.prisma.financingApplication.findMany({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
    });

    return applications.map((application) => ({
      id: application.id,
      companyId: application.companyId,
      requestedAmount: application.requestedAmount.toString(),
      desiredTermMonths: application.desiredTermMonths,
      fundingPurpose: application.fundingPurpose,
      urgencyLevel: application.urgencyLevel,
      needType: application.needType,
      status: application.status,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    }));
  }

  private async findAccessibleCompany(id: string, user: AuthenticatedUser) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        ...(user.role === 'applicant' ? { applicantUserId: user.id } : {}),
      },
    });

    if (!company) {
      throw new ApiException(404, 'NOT_FOUND', 'Empresa no encontrada.');
    }

    return company;
  }

  private async ensureApplicantCanEditCompany(companyId: string) {
    const lockedApplication = await this.prisma.financingApplication.findFirst({
      where: {
        companyId,
        status: { in: LOCKED_APPLICATION_STATUSES },
      },
      select: { id: true, status: true },
    });

    if (lockedApplication) {
      throw new ApiException(
        400,
        'INVALID_STATE_TRANSITION',
        'La empresa no puede editarse por applicant despues de ready_for_analysis.',
        [{ field: 'status', issue: `locked_by_${lockedApplication.status}` }],
      );
    }
  }

  private async ensureRfcIsAvailable(rfc: string, currentCompanyId?: string) {
    const existing = await this.prisma.company.findUnique({
      where: { rfc },
      select: { id: true },
    });

    if (existing && existing.id !== currentCompanyId) {
      throw new ApiException(
        409,
        'DUPLICATE_RESOURCE',
        'Ya existe una empresa con ese RFC.',
        [{ field: 'rfc', issue: 'unique' }],
      );
    }
  }

  private async resolveApplicantUserId(applicantUserId?: string) {
    if (!applicantUserId) {
      return null;
    }

    const applicant = await this.prisma.user.findFirst({
      where: {
        id: applicantUserId,
        isActive: true,
        role: {
          name: 'applicant',
          isActive: true,
        },
      },
      select: { id: true },
    });

    if (!applicant) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El applicant_user_id no corresponde a un applicant activo.',
        [{ field: 'applicantUserId', issue: 'invalid_applicant' }],
      );
    }

    return applicant.id;
  }

  private normalizeRfc(rfc: string) {
    return rfc.trim().toUpperCase();
  }

  private validateRfcForBusinessType(rfc: string, businessType: BusinessType) {
    const expectedLength = businessType === 'persona_moral' ? 12 : 13;
    const rfcPattern =
      businessType === 'persona_moral'
        ? /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/
        : /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

    if (rfc.length !== expectedLength || !rfcPattern.test(rfc)) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El RFC no coincide con el tipo de empresa.',
        [{ field: 'rfc', issue: `invalid_for_${businessType}` }],
      );
    }
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toResponse(company: Company, user: AuthenticatedUser) {
    const base = {
      id: company.id,
      legalName: company.legalName,
      tradeName: company.tradeName,
      rfc: company.rfc,
      businessType: company.businessType,
      sector: company.sector,
      yearsOperating: company.yearsOperating.toString(),
      monthlyRevenue: company.monthlyRevenue.toString(),
      monthlyExpenses: company.monthlyExpenses.toString(),
      employeeCount: company.employeeCount,
      contactEmail: company.contactEmail,
      contactPhone: company.contactPhone,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    };

    if (user.role === 'internal_operator') {
      return {
        ...base,
        applicantUserId: company.applicantUserId,
        createdByUserId: company.createdByUserId,
      };
    }

    return base;
  }
}
