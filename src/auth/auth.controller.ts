import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  THROTTLE_AUTH_LIMIT,
  THROTTLE_LIMITS,
  THROTTLE_TTL_MS,
} from '../configuration/throttle.constants';
import { AuthService } from './auth.service';
import type { AuthPayload } from './contracts/auth-payload.contract';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { EmailLoginDto, GoogleLoginDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({
    [THROTTLE_LIMITS.auth.name]: {
      limit: THROTTLE_AUTH_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  @Post('google')
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto.credential);
  }

  @Public()
  @Throttle({
    [THROTTLE_LIMITS.auth.name]: {
      limit: THROTTLE_AUTH_LIMIT,
      ttl: THROTTLE_TTL_MS,
    },
  })
  @Post('email')
  loginWithEmail(@Body() dto: EmailLoginDto) {
    return this.authService.loginWithEmail(dto.email);
  }

  @Get('me')
  getMe(@CurrentUser() user: AuthPayload) {
    return this.authService.getMe(user.sub);
  }
}
