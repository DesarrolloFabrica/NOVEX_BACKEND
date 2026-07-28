import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { UserStatus } from '../common/enums/identity.enums';
import { RbacService } from '../rbac/rbac.service';
import { User } from '../users/entities/user.entity';
import { UsersRepository } from '../users/repositories/users.repository';
import { AuthPayload } from './contracts/auth-payload.contract';
import {
  AuthMeResponseDto,
  AuthUserSummaryDto,
  GoogleLoginResponseDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rbacService: RbacService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<string>('google.clientId', {
      infer: true,
    });
    this.googleClient = new OAuth2Client(googleClientId);
  }

  async loginWithGoogle(credential: string): Promise<GoogleLoginResponseDto> {
    const googleClientId = this.configService.get<string>('google.clientId', {
      infer: true,
    });
    if (!googleClientId) {
      throw new UnauthorizedException('Google Client ID no configurado.');
    }

    let tokenPayload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      tokenPayload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Credencial de Google inválida.');
    }

    if (!tokenPayload?.email || tokenPayload.email_verified !== true) {
      throw new UnauthorizedException('Credencial de Google inválida.');
    }

    const email = tokenPayload.email.trim().toLowerCase();
    const googleSub = tokenPayload.sub;
    const fullName = tokenPayload.name?.trim() || email;
    const photoUrl = tokenPayload.picture ?? null;

    const user = await this.findActiveUserByEmail(email);
  if (!user) {
      throw new UnauthorizedException('Usuario no autorizado.');
    }

    user.googleSub = googleSub;
    user.photoUrl = photoUrl;
    user.fullName = fullName;
    user.lastLoginAt = new Date();

    const savedUser = await this.usersRepository.save(user);
    return this.buildLoginResponse(savedUser);
  }

  async loginWithEmail(email: string): Promise<GoogleLoginResponseDto> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.findActiveUserByEmail(normalizedEmail);

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado.');
    }

    user.lastLoginAt = new Date();
    const savedUser = await this.usersRepository.save(user);
    return this.buildLoginResponse(savedUser);
  }

  async getMe(userId: string): Promise<AuthMeResponseDto> {
    const user = await this.usersRepository.findByIdWithRelations(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo.');
    }

    const access = await this.rbacService.getUserPermissions(userId);

    return {
      user: this.toUserSummary(user),
      role: {
        id: user.role.id,
        code: user.role.code,
        name: user.role.name,
      },
      coordination: {
        id: user.coordination.id,
        code: user.coordination.code,
        name: user.coordination.name,
      },
      permissions: access.permissions,
    };
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.usersRepository.findByIdWithRelations(userId);
    if (!user) {
      throw new UnauthorizedException(`Usuario no encontrado: ${userId}`);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('El usuario no está activo.');
    }

    return user;
  }

  async buildAuthPayload(user: User): Promise<AuthPayload> {
    const userPermissions = await this.rbacService.getUserPermissions(user.id);

    return {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleCode: user.role.code,
      coordinationId: user.coordinationId,
      permissions: userPermissions.permissions.map(
        (permission) => permission.code,
      ),
      status: user.status,
    };
  }

  async generateAccessToken(user: User): Promise<{
    accessToken: string;
    expiresIn: string;
  }> {
    const payload = await this.buildAuthPayload(user);
    const expiresIn =
      this.configService.get<string>('jwt.expiresIn', { infer: true }) ?? '1h';

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as JwtSignOptions['expiresIn'],
    });

    return { accessToken, expiresIn };
  }

  getHealthStatus(): { status: 'ok'; module: 'auth' } {
    return { status: 'ok', module: 'auth' };
  }

  private async findActiveUserByEmail(email: string): Promise<User | null> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.coordination', 'coordination')
      .where('LOWER(user.email) = :email', { email })
      .getOne();

    if (!user) {
      return null;
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo.');
    }

    return user;
  }

  private async buildLoginResponse(
    user: User,
  ): Promise<GoogleLoginResponseDto> {
    const token = await this.generateAccessToken(user);

    return {
      ...token,
      user: this.toUserSummary(user),
    };
  }

  private toUserSummary(user: User): AuthUserSummaryDto {
    return {
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      fullName: user.fullName,
      photoUrl: user.photoUrl,
      roleId: user.roleId,
      roleCode: user.role.code,
      roleName: user.role.name,
      coordinationId: user.coordinationId,
      coordinationCode: user.coordination.code,
      coordinationName: user.coordination.name,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
