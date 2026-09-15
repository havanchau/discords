import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { RateLimit } from '../../common/rate-limit.decorator';
import { RequestUser } from '../../common/request-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @RateLimit({ keyPrefix: 'category-create', limit: 20, windowMs: 60_000 })
  @Post('servers/:serverId/categories')
  create(
    @CurrentUser() user: RequestUser,
    @Param('serverId') serverId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categories.createCategory(user.id, serverId, dto);
  }

  @Patch('categories/:categoryId')
  update(
    @CurrentUser() user: RequestUser,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.updateCategory(user.id, categoryId, dto);
  }

  @Delete('categories/:categoryId')
  remove(@CurrentUser() user: RequestUser, @Param('categoryId') categoryId: string) {
    return this.categories.deleteCategory(user.id, categoryId);
  }
}
