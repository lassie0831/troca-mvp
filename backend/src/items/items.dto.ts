import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { CATEGORY_SLUGS } from './categories.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateItemDto {
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  title!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Estimated value in cents (BRL). R$ 1,00 – R$ 1.000.000,00. */
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  priceCents!: number;

  @IsIn(CATEGORY_SLUGS)
  category!: string;

  /** Device position at the moment of registration. Stored server-side only. */
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}

export class UpdateItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(3, 80)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  priceCents?: number;

  @IsOptional()
  @IsIn(CATEGORY_SLUGS)
  category?: string;
}
