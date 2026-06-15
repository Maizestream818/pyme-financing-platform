import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApplicationMatchesService } from './application-matches.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller('risk-assessments/:id/matches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator')
export class ApplicationMatchesController {
  constructor(private readonly applicationMatchesService: ApplicationMatchesService) {}

  @Get()
  async findByRiskAssessment(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationMatchesService.findByRiskAssessment(id),
      request,
    );
  }

  @Post()
  async generate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationMatchesService.generate(
        id,
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
