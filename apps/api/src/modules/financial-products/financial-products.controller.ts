import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiOk } from '../../common/filters/api-response';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateFinancialProductDto } from './dto/create-financial-product.dto';
import { UpdateFinancialProductDto } from './dto/update-financial-product.dto';
import { FinancialProductsService } from './financial-products.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('financial-products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator')
export class FinancialProductsController {
  constructor(private readonly financialProductsService: FinancialProductsService) {}

  @Get()
  async findAll(@Req() request: RequestLike) {
    return apiOk(await this.financialProductsService.findAll(), request);
  }

  @Post()
  async create(
    @Body() dto: CreateFinancialProductDto,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.financialProductsService.create(dto), request);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateFinancialProductDto,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.financialProductsService.update(id, dto), request);
  }

  @Get(':id/rules')
  async findRules(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.financialProductsService.findRules(id), request);
  }
}
