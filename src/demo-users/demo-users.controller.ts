import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { EnsureDemoUserDto } from './dto/demo-user.dto';
import { DemoUsersService } from './demo-users.service';

/** Endpoints legados de onboarding demo. Ruta preservada para el frontend actual. */
@Controller('users')
export class DemoUsersController {
  constructor(private readonly demoUsersService: DemoUsersService) {}

  @Post('ensure')
  ensure(@Body() dto: EnsureDemoUserDto) {
    return this.demoUsersService.ensure(dto);
  }

  @Patch(':id/onboarding/complete')
  completeOnboarding(@Param('id') id: string) {
    return this.demoUsersService.completeOnboarding(id);
  }
}
