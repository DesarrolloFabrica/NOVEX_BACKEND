import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { EnsureUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('ensure')
  ensure(@Body() dto: EnsureUserDto) {
    return this.usersService.ensure(dto);
  }

  @Patch(':id/onboarding/complete')
  completeOnboarding(@Param('id') id: string) {
    return this.usersService.completeOnboarding(id);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }
}
