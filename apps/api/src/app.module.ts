import { Module, ValidationError, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { ApiException } from './common/filters/api.exception';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { PrismaModule } from './common/prisma/prisma.module';

function flattenValidationErrors(errors: ValidationError[]) {
  const details: Array<{ field: string; issue: string }> = [];

  const visit = (error: ValidationError, path: string) => {
    const field = path ? `${path}.${error.property}` : error.property;

    if (error.constraints) {
      for (const issue of Object.values(error.constraints)) {
        details.push({ field, issue });
      }
    }

    for (const child of error.children ?? []) {
      visit(child, field);
    }
  };

  for (const error of errors) {
    visit(error, '');
  }

  return details;
}

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, RolesModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          exceptionFactory: (errors) =>
            new ApiException(
              400,
              'VALIDATION_ERROR',
              'La solicitud contiene datos invalidos.',
              flattenValidationErrors(errors),
            ),
        }),
    },
  ],
})
export class AppModule {}
