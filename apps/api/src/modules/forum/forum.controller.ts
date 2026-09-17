import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@/common/current-user.decorator';
import { RateLimit } from '@/common/rate-limit.decorator';
import { RequestUser } from '@/common/request-user';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateForumPostDto } from './dto/create-forum-post.dto';
import { ListForumPostsQueryDto } from './dto/list-forum-posts-query.dto';
import { UpdateForumTagsDto } from './dto/update-forum-tags.dto';
import { ForumPostsService } from './forum-posts.service';
import { ForumTagsService } from './forum-tags.service';

@UseGuards(JwtAuthGuard)
@Controller('channels/:channelId')
export class ForumController {
  constructor(
    private readonly posts: ForumPostsService,
    private readonly tags: ForumTagsService,
  ) {}

  @Get('forum-posts')
  listPosts(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Query() query: ListForumPostsQueryDto,
  ) {
    return this.posts.listPosts(user.id, channelId, query);
  }

  @RateLimit({ keyPrefix: 'forum-post-create', limit: 10, windowMs: 60_000 })
  @Post('forum-posts')
  createPost(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateForumPostDto,
  ) {
    return this.posts.createPost(user.id, channelId, dto);
  }

  @Get('forum-tags')
  listTags(@CurrentUser() user: RequestUser, @Param('channelId') channelId: string) {
    return this.tags.listTags(user.id, channelId);
  }

  @Put('forum-tags')
  replaceTags(
    @CurrentUser() user: RequestUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateForumTagsDto,
  ) {
    return this.tags.replaceTags(user.id, channelId, dto);
  }
}
