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
import { ApplicationDecisionsService } from './application-decisions.service';
import { CloseApplicationDto } from './dto/close-application.dto';
import { CreateApplicationDecisionDto } from './dto/create-application-decision.dto';
import { UpdateApplicationDecisionDto } from './dto/update-application-decision.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles('internal_operator', 'applicant')
export class ApplicationDecisionsController {
  constructor(
    private readonly applicationDecisionsService: ApplicationDecisionsService,
  ) {}

  @Get('applications/:id/internal-file')
  @Roles('internal_operator')
  async getInternalFile(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.applicationDecisionsService.getInternalFile(id), request);
  }

  @Post('applications/:id/decisions')
  @Roles('internal_operator')
  async create(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateApplicationDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.create(
        id,
        dto,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Get('applications/:id/decisions')
  @Roles('internal_operator')
  async findByApplication(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.findByApplication(id),
      request,
    );
  }

  @Patch('application-decisions/:id')
  @Roles('internal_operator')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateApplicationDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.update(
        id,
        dto,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Patch('application-decisions/:id/publish')
  @Roles('internal_operator')
  async publish(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.publish(
        id,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Get('applications/:id/public-decision')
  @Ownership('application')
  async getPublicDecision(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.getPublicDecision(id, user),
      request,
    );
  }

  @Patch('applications/:id/close')
  @Roles('internal_operator')
  async close(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CloseApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDecisionsService.close(
        id,
        dto,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  private auditContext(request: RequestLike) {
    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
