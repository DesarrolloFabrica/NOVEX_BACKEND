import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthPayload } from '../contracts/auth-payload.contract';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthPayload | undefined => {
    const request = context.switchToHttp().getRequest<{ user?: AuthPayload }>();
    return request.user;
  },
);
