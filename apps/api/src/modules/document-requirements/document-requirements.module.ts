import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentRequirementsController } from './document-requirements.controller';
import { DocumentRequirementsService } from './document-requirements.service';

@Module({
  imports: [AuthModule],
  controllers: [DocumentRequirementsController],
  providers: [DocumentRequirementsService],
})
export class DocumentRequirementsModule {}
