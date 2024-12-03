import { Controller, Get } from '@nestjs/common';
import { GAMES } from '@bot-friend/shared';
import { Public } from '../auth/decorators.js';

@Controller('v1/games')
export class GamesController {
  @Public()
  @Get()
  list() {
    return { items: Object.values(GAMES) };
  }
}
