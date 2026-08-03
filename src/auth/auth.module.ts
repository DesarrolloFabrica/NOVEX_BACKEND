import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { OperationalScopeService } from './services/operational-scope.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('jwt.secret', { infer: true });
        if (!secret) {
          throw new Error('JWT_SECRET no está configurado.');
        }

        const expiresIn =
          configService.get<string>('jwt.expiresIn', { infer: true }) ?? '1h';

        return {
          secret,
          signOptions: {
            expiresIn: expiresIn as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
    UsersModule,
    RbacModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    PermissionsGuard,
    OperationalScopeService,
  ],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    PermissionsGuard,
    OperationalScopeService,
  ],
})
export class AuthModule {}
