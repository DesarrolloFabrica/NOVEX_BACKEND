import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Permission } from '../entities/permission.entity';
import { RolePermission } from '../entities/role-permission.entity';

@Injectable()
export class RolePermissionsRepository extends Repository<RolePermission> {
  constructor(private readonly dataSource: DataSource) {
    super(RolePermission, dataSource.createEntityManager());
  }

  findByRoleId(roleId: string): Promise<RolePermission[]> {
    return this.find({
      where: { roleId },
      relations: { permission: true },
      order: { permission: { module: 'ASC', code: 'ASC' } },
    });
  }

  findPermissionsByRoleId(roleId: string): Promise<Permission[]> {
    return this.createQueryBuilder('rolePermission')
      .innerJoinAndSelect('rolePermission.permission', 'permission')
      .where('rolePermission.roleId = :roleId', { roleId })
      .orderBy('permission.module', 'ASC')
      .addOrderBy('permission.code', 'ASC')
      .getMany()
      .then((rows) => rows.map((row) => row.permission));
  }

  existsAssignment(roleId: string, permissionId: string): Promise<boolean> {
    return this.exists({ where: { roleId, permissionId } });
  }
}
