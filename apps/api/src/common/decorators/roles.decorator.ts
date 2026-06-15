import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type RoleName = 'internal_operator' | 'applicant';

export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
