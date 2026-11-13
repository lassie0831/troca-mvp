import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Public, type AuthUser } from '../common/auth.decorators.js';
import { CATEGORIES } from './categories.js';
import { CreateItemDto, UpdateItemDto } from './items.dto.js';
import { ItemsService } from './items.service.js';

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

@Controller()
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Public()
  @Get('categories')
  categories() {
    return CATEGORIES;
  }

  @Post('items')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateItemDto) {
    return this.items.create(user.id, dto);
  }

  @Get('items/mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.items.listMine(user.id);
  }

  @Get('items/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.items.get(user.id, id);
  }

  @Patch('items/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateItemDto) {
    return this.items.update(user.id, id, dto);
  }

  @Delete('items/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.items.archive(user.id, id);
  }

  @Post('items/:id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.items.addPhoto(user.id, id, file?.buffer);
  }

  @Delete('items/:id/photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ): Promise<void> {
    await this.items.deletePhoto(user.id, id, photoId);
  }
}
