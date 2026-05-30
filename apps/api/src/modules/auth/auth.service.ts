import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto, userAgent?: string) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] }
    });

    if (existing) {
      throw new ConflictException('Email or username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        displayName: dto.displayName || dto.username,
        passwordHash
      }
    });

    return this.createSession(user.id, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(user.id, userAgent);
  }

  async logoutUser(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return { ok: true };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        status: true,
        createdAt: true
      }
    });
    return { user };
  }

  private async createSession(userId: string, userAgent?: string) {
    const refreshToken = randomUUID();
    const refreshHash = await bcrypt.hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshHash,
        userAgent,
        expiresAt
      }
    });

    const accessToken = await this.jwt.signAsync({
      sub: userId,
      sid: session.id
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      ...(await this.getMe(userId))
    };
  }
}
