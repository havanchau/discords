import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(email: string, token: string) {
    const webOrigin = this.config.get<string>('WEB_ORIGIN', 'http://localhost:5173');
    const verifyUrl = `${webOrigin}/verify-email?token=${token}`;
    const host = this.config.get<string>('SMTP_HOST');

    if (!host) {
      this.logger.log(`Verification email for ${email}: ${verifyUrl}`);
      return { sent: false, verifyUrl };
    }

    const transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS')
          }
        : undefined
    });

    await transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM', 'Discord Clone <no-reply@discord-clone.local>'),
      to: email,
      subject: 'Verify your Discord Clone account',
      text: `Verify your account: ${verifyUrl}`,
      html: `<p>Verify your account:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
    });

    return { sent: true, verifyUrl };
  }
}
