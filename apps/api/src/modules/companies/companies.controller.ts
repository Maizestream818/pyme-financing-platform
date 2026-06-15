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
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Ownership, OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles('internal_operator', 'applicant')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.companiesService.findAll(user), request);
  }

  @Post()
  async create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.companiesService.create(dto, user), request);
  }

  @Get(':id')
  @Ownership('company')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.companiesService.findOne(id, user), request);
  }

  @Patch(':id')
  @Ownership('company')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.companiesService.update(id, dto, user), request);
  }

  @Get(':id/applications')
  @Ownership('company')
  async findApplications(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.companiesService.findApplications(id, user), request);
  }
}
