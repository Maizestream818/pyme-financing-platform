import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile as NestUploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { UploadedFile } from '../../common/files/uploaded-file';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Ownership, OwnershipGuard } from '../../common/guards/ownership.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ApplicationDocumentsService } from './application-documents.service';
import { ReviewApplicationDocumentDto } from './dto/review-application-document.dto';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
};

type DownloadResponse = {
  setHeader: (name: string, value: string) => void;
};

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, OwnershipGuard)
@Roles('internal_operator', 'applicant')
export class ApplicationDocumentsController {
  constructor(
    private readonly applicationDocumentsService: ApplicationDocumentsService,
  ) {}

  @Post('applications/:id/documents/initialize')
  @Ownership('application')
  async initializeChecklist(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDocumentsService.initializeChecklist(id, user),
      request,
    );
  }

  @Get('applications/:id/documents')
  @Ownership('application')
  async findByApplication(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDocumentsService.findByApplication(id, user),
      request,
    );
  }

  @Post('application-documents/:id/upload')
  @Ownership('applicationDocument')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @NestUploadedFile() file: UploadedFile | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDocumentsService.upload(
        id,
        file,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Patch('application-documents/:id/review')
  @Roles('internal_operator')
  async review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewApplicationDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: RequestLike,
  ) {
    return apiOk(
      await this.applicationDocumentsService.review(
        id,
        dto,
        user,
        this.auditContext(request),
      ),
      request,
    );
  }

  @Get('application-documents/:id/download')
  @Ownership('applicationDocument')
  async download(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: DownloadResponse,
  ) {
    return this.applicationDocumentsService.download(id, user, response);
  }

  private auditContext(request: RequestLike) {
    const userAgent = request.headers?.['user-agent'];

    return {
      ipAddress: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
