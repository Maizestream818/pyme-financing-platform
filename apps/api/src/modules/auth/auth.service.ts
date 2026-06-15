import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApiException } from '../../common/filters/api.exception';
import { LoginDto } from './dto/login.dto';
import { RegisterApplicantDto } from './dto/register-applicant.dto';
import { AuditContext, AuthAuditService } from './auth-audit.service';

const PASSWORD_SALT_ROUNDS = 12;
const GENERIC_LOGIN_MESSAGE =
  'No se pudo iniciar sesion con las credenciales proporcionadas.';

type UserWithRole = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  role: {
    name: string;
    isActive: boolean;
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly audit: AuthAuditService,
  ) {}

  async registerApplicant(
    dto: RegisterApplicantDto,
    context?: AuditContext,
    createdByUserId?: string,
  ) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ApiException(
        409,
        'DUPLICATE_RESOURCE',
        'Ya existe un usuario con ese correo.',
      );
    }

    const applicantRole = await this.prisma.role.findUnique({
      where: { name: 'applicant' },
    });

    if (!applicantRole?.isActive) {
      throw new ApiException(
        400,
        'VALIDATION_ERROR',
        'El rol applicant no esta disponible.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        email,
        passwordHash,
        roleId: applicantRole.id,
        isActive: true,
      },
      include: { role: true },
    });

    await this.audit.log({
      userId: createdByUserId ?? user.id,
      action: 'register_applicant',
      entityName: 'users',
      entityId: user.id,
      newValues: {
        email: user.email,
        role: user.role.name,
        createdBy: createdByUserId ? 'internal_operator' : 'public_register',
      },
      context,
    });

    return this.toPublicUser(user);
  }

  async login(dto: LoginDto, context?: AuditContext) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    const passwordMatches =
      user?.passwordHash && (await bcrypt.compare(dto.password, user.passwordHash));

    if (!user || !passwordMatches || !user.isActive || !user.role.isActive) {
      await this.audit.log({
        action: 'login',
        entityName: 'auth',
        newValues: { result: 'failed' },
        context,
      });

      throw new ApiException(
        401,
        'AUTH_INVALID_CREDENTIALS',
        GENERIC_LOGIN_MESSAGE,
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      include: { role: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'login',
      entityName: 'users',
      entityId: user.id,
      newValues: { result: 'success' },
      context,
    });

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role.name,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
      user: this.toPublicUser(updatedUser),
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.isActive || !user.role.isActive) {
      throw new ApiException(401, 'UNAUTHORIZED', 'Usuario no autorizado.');
    }

    return this.toPublicUser(user);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private toPublicUser(user: UserWithRole) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role.name,
      isActive: user.isActive,
    };
  }
}
