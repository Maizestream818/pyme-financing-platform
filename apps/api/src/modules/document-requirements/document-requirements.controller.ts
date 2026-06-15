import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DocumentRequirementsService } from './document-requirements.service';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('document-requirements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator', 'applicant')
export class DocumentRequirementsController {
  constructor(
    private readonly documentRequirementsService: DocumentRequirementsService,
  ) {}

  @Get()
  async findAll(@Req() request: RequestLike) {
    return apiOk(await this.documentRequirementsService.findAll(), request);
  }

  @Post()
  @Roles('internal_operator')
  async create(
    @Body() dto: CreateDocumentRequirementDto,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.documentRequirementsService.create(dto), request);
  }

  @Patch(':id')
  @Roles('internal_operator')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDocumentRequirementDto,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.documentRequirementsService.update(id, dto), request);
  }
}
