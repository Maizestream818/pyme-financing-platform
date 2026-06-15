import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from '../auth/auth.service';
import { CreateApplicantUserDto } from './dto/create-applicant-user.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @Roles('internal_operator')
  async createApplicant(
    @Body() dto: CreateApplicantUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    const userAgent = request.headers?.['user-agent'];
    const data = await this.authService.registerApplicant(
      dto,
      {
        ipAddress: request.ip,
        userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
      },
      currentUser.id,
    );

    return apiOk(data, request);
  }
}
