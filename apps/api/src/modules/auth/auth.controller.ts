import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { apiOk } from '../../common/filters/api-response';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterApplicantDto } from './dto/register-applicant.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterApplicantDto, @Req() request: RequestLike) {
    const data = await this.authService.registerApplicant(
      dto,
      this.auditContext(request),
    );

    return apiOk(data, request);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: RequestLike) {
    const data = await this.authService.login(dto, this.auditContext(request));

    return apiOk(data, request);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }, @Req() request: RequestLike) {
    const data = await this.authService.getCurrentUser(user.id);

    return apiOk(data, request);
  }

  private auditContext(request: RequestLike) {
    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
