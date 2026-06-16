import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditLogsService } from './audit-logs.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  async findRecent(@Req() request: RequestLike) {
    return apiOk(await this.auditLogsService.findRecent(), request);
  }
}
