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
import { RiskAssessmentsService } from './risk-assessments.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator')
export class RiskAssessmentsController {
  constructor(private readonly riskAssessmentsService: RiskAssessmentsService) {}

  @Post('applications/:id/risk-assessments')
  async calculate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.riskAssessmentsService.calculate(id, user, this.auditContext(request)),
      request,
    );
  }

  @Get('applications/:id/risk-assessments')
  async findByApplication(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.riskAssessmentsService.findByApplication(id), request);
  }

  @Get('risk-assessments/:id')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.riskAssessmentsService.findOne(id), request);
  }

  private auditContext(request: RequestLike) {
    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
