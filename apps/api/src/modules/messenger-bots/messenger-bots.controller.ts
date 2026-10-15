import { Body, Controller, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Public, SkipCsrf } from '../../common/auth/decorators.js';
import { MessengerBotsService } from './messenger-bots.service.js';

@ApiTags('messenger-bots')
@Public()
@SkipCsrf()
@Controller('integrations')
export class MessengerBotsController {
  constructor(private readonly bots: MessengerBotsService) {}

  /** Telegram provides the configured secret in this request header. */
  @Post('telegram/webhook')
  @HttpCode(200)
  async telegram(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    this.bots.authorize('telegram', secret);
    await this.bots.handle('telegram', body);
    return { ok: true };
  }

  /**
   * Bale webhook URL contains a separate random capability, NOT the bot token.
   * Never publish the URL, log it or use the bot token as this path segment.
   */
  @Post('bale/webhook/:secret')
  @HttpCode(200)
  async bale(@Param('secret') secret: string, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    this.bots.authorize('bale', secret);
    await this.bots.handle('bale', body);
    return { ok: true };
  }
}
