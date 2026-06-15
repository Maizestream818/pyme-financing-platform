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
import { CreateFinancingApplicationDto } from './dto/create-financing-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { UpdateFinancialInfoDto } from './dto/update-financial-info.dto';
import { UpdateFinancingApplicationDto } from './dto/update-financing-application.dto';
import { ValidateNeedTypeDto } from './dto/validate-need-type.dto';
import { FinancingApplicationsService } from './financing-applications.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller('applications')
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles('internal_operator', 'applicant')
export class FinancingApplicationsController {
  constructor(
    private readonly applicationsService: FinancingApplicationsService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationsService.findAll(user), request);
  }

  @Post()
  async create(
    @Body() dto: CreateFinancingApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationsService.create(dto, user), request);
  }

  @Get(':id/status-history')
  @Ownership('application')
  async findStatusHistory(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationsService.findStatusHistory(id, user), request);
  }

  @Get(':id')
  @Ownership('application')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationsService.findOne(id, user), request);
  }

  @Patch(':id/financial-info')
  @Ownership('application')
  async updateFinancialInfo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFinancialInfoDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationsService.updateFinancialInfo(id, dto, user),
      request,
    );
  }

  @Patch(':id/status')
  @Roles('internal_operator')
  async updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationsService.updateStatus(id, dto, user),
      request,
    );
  }

  @Patch(':id/validated-need-type')
  @Roles('internal_operator')
  async validateNeedType(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ValidateNeedTypeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationsService.validateNeedType(
        id,
        dto,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Patch(':id')
  @Ownership('application')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFinancingApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationsService.update(id, dto, user), request);
  }

  private auditContext(request: RequestLike) {
    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
