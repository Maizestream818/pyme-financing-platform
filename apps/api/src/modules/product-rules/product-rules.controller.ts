import {
  Body,
  Controller,
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
import { CreateProductRuleDto } from './dto/create-product-rule.dto';
import { UpdateProductRuleDto } from './dto/update-product-rule.dto';
import { ProductRulesService } from './product-rules.service';

type RequestLike = {
  headers?: Record<string, string | string[] | undefined>;
};

@Controller('product-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('internal_operator')
export class ProductRulesController {
  constructor(private readonly productRulesService: ProductRulesService) {}

  @Post()
  async create(@Body() dto: CreateProductRuleDto, @Req() request: RequestLike) {
    return apiOk(await this.productRulesService.create(dto), request);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductRuleDto,
    @Req() request: RequestLike,
  ) {
    return apiOk(await this.productRulesService.update(id, dto), request);
  }
}
