import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Locale } from '../../common/i18n/locale';
import { defaultWebOrigin, primaryWebOrigin } from '../../common/web-origins';
import { I18nService } from '../../common/i18n/i18n.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly i18n: I18nService
  ) {}

  async sendVerificationEmail(email: string, token: string, locale: Locale = 'en') {
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
      subject: this.i18n.t(locale, 'email.verify.subject'),
      text: this.i18n.t(locale, 'email.verify.text', { url: verifyUrl }),
      html: this.linkHtml(
        this.i18n.t(locale, 'email.verify.intro'),
        verifyUrl,
        this.i18n.t(locale, 'email.verify.ignore')
      )
    });

    return { sent: true };
  }

  async sendPasswordResetEmail(email: string, token: string, locale: Locale = 'en') {
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
      subject: this.i18n.t(locale, 'email.reset.subject'),
      text: this.i18n.t(locale, 'email.reset.text', { url: resetUrl }),
      html: this.linkHtml(
        this.i18n.t(locale, 'email.reset.intro'),
        resetUrl,
        this.i18n.t(locale, 'email.reset.ignore')
      )
    });

    return { sent: true };
  }

  // Catalog copy is ours, but it still reaches an HTML context, so it is escaped like any other value.
  private linkHtml(intro: string, url: string, outro: string) {
    return `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p>${escapeHtml(outro)}</p>`;
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
