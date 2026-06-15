import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthAuditService } from './auth-audit.service';

const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ??
  '1d') as JwtSignOptions['expiresIn'];

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change_me_for_local_development',
      signOptions: {
        expiresIn: jwtExpiresIn,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthAuditService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
