import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RolesService } from './roles.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('internal_operator')
  async findAll(@Req() request: RequestLike) {
    return apiOk(await this.rolesService.findAll(), request);
  }
}
