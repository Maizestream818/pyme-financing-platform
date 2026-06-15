import { Injectable } from '@nestjs/common';
import { DocumentRequirement } from '@prisma/client';
import { ApiException } from '../../common/filters/api.exception';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';

@Injectable()
export class DocumentRequirementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const requirements = await this.prisma.documentRequirement.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return requirements.map((requirement) => this.toResponse(requirement));
  }

  async create(dto: CreateDocumentRequirementDto) {
    await this.ensureNameIsAvailable(dto.name);

    const requirement = await this.prisma.documentRequirement.create({
      data: {
        name: dto.name.trim(),
        description: this.optionalTrim(dto.description),
        isRequired: dto.isRequired ?? true,
        appliesTo: dto.appliesTo ?? null,
        appliesToBusinessType: dto.appliesToBusinessType ?? null,
        isActive: true,
      },
    });

    return this.toResponse(requirement);
  }

  async update(id: string, dto: UpdateDocumentRequirementDto) {
    const current = await this.prisma.documentRequirement.findUnique({
      where: { id },
    });

    if (!current) {
      throw new ApiException(
        404,
        'NOT_FOUND',
        'Requisito documental no encontrado.',
      );
    }

    if (dto.name && dto.name.trim() !== current.name) {
      await this.ensureNameIsAvailable(dto.name, id);
    }

    const requirement = await this.prisma.documentRequirement.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name.trim(),
        description:
          dto.description === undefined
            ? undefined
            : this.optionalTrim(dto.description),
        isRequired: dto.isRequired,
        appliesTo: dto.appliesTo === undefined ? undefined : dto.appliesTo,
        appliesToBusinessType:
          dto.appliesToBusinessType === undefined
            ? undefined
            : dto.appliesToBusinessType,
        isActive: dto.isActive,
      },
    });

    return this.toResponse(requirement);
  }

  private async ensureNameIsAvailable(name: string, currentId?: string) {
    const existing = await this.prisma.documentRequirement.findUnique({
      where: { name: name.trim() },
      select: { id: true },
    });

    if (existing && existing.id !== currentId) {
      throw new ApiException(
        409,
        'DUPLICATE_RESOURCE',
        'Ya existe un requisito documental con ese nombre.',
        [{ field: 'name', issue: 'unique' }],
      );
    }
  }

  private optionalTrim(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toResponse(requirement: DocumentRequirement) {
    return {
      id: requirement.id,
      name: requirement.name,
      description: requirement.description,
      isRequired: requirement.isRequired,
      appliesTo: requirement.appliesTo,
      appliesToBusinessType: requirement.appliesToBusinessType,
      isActive: requirement.isActive,
      createdAt: requirement.createdAt,
      updatedAt: requirement.updatedAt,
    };
  }
}
