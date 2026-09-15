import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { defaultWebOrigin, primaryWebOrigin } from '../../common/web-origins';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(email: string, token: string) {
    const verifyUrl = `${this.linkOrigin()}/verify-email?token=${token}`;
    const host = this.config.get<string>('SMTP_HOST');

    if (!host) {
      // A verification link proves mailbox ownership: only local development may read it from the log.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.warn('Verification email requested but SMTP_HOST is not configured');
      } else {
        this.logger.warn(`SMTP_HOST is not configured. Development verification link: ${verifyUrl}`);
      }
      return { sent: false };
    }

    await this.createTransport(host).sendMail({
      from: this.config.get<string>('SMTP_FROM', 'Discord Clone <no-reply@discord-clone.local>'),
      to: email,
      subject: 'Verify your Discord Clone account',
      text: `Verify your account within 1 hour: ${verifyUrl}\n\nIf you did not create this account, ignore this email.`,
      html: `<p>Verify your account within 1 hour:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you did not create this account, ignore this email.</p>`
    });

    return { sent: true };
  }

  async sendPasswordResetEmail(email: string, token: string) {
    const resetUrl = `${this.linkOrigin()}/reset-password?token=${token}`;
    const host = this.config.get<string>('SMTP_HOST');

    if (!host) {
      // A reset link is a credential: only local development may read it from the log.
      if (this.config.get<string>('NODE_ENV') === 'production') {
        this.logger.warn('Password reset requested but SMTP_HOST is not configured');
      } else {
        this.logger.warn(`SMTP_HOST is not configured. Development password reset link: ${resetUrl}`);
      }
      return { sent: false };
    }

    await this.createTransport(host).sendMail({
      from: this.config.get<string>('SMTP_FROM', 'Discord Clone <no-reply@discord-clone.local>'),
      to: email,
      subject: 'Reset your Discord Clone password',
      text: `Reset your password within 30 minutes: ${resetUrl}\n\nIf you did not ask for this, ignore this email.`,
      html: `<p>Reset your password within 30 minutes:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not ask for this, ignore this email.</p>`
    });

    return { sent: true };
  }

  private linkOrigin() {
    return primaryWebOrigin(this.config.get<string>('WEB_ORIGIN', defaultWebOrigin));
  }

  private createTransport(host: string) {
    return nodemailer.createTransport({
      host,
      // Env values are strings; nodemailer needs a number to pick implicit TLS on 465.
      port: Number(this.config.get<string>('SMTP_PORT', '587')),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS')
          }
        : undefined
    });
  }
}
