import { DataSource, DataSourceOptions } from 'typeorm';
import { UserStatus } from '../../common/enums/identity.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import { buildDataSourceOptions } from '../data-source';

export interface CloudUserRow {
  id: string;
  email: string;
  googleSub: string | null;
  fullName: string;
  photoUrl: string | null;
  status: UserStatus;
  lastLoginAt: Date | null;
  onboardingStep: number;
  onboardingCompleted: boolean;
  onboardingSeenAt: Date | null;
  roleCode: string;
  coordinationCode: string | null;
}

export interface SyncUsersFromCloudResult {
  coordinationsCreated: number;
  coordinationsUpdated: number;
  usersCreated: number;
  usersUpdated: number;
  usersSkipped: number;
  cloudUserCount: number;
}

function buildCloudDataSourceOptions(): DataSourceOptions {
  return buildDataSourceOptions('cloud');
}

async function fetchCloudUsers(
  cloudDataSource: DataSource,
): Promise<CloudUserRow[]> {
  const rows = await cloudDataSource.query<
    Array<{
      id: string;
      email: string;
      google_sub: string | null;
      full_name: string;
      photo_url: string | null;
      status: UserStatus;
      last_login_at: Date | null;
      onboarding_step: number;
      onboarding_completed: boolean;
      onboarding_seen_at: Date | null;
      role_code: string;
      coordination_code: string | null;
    }>
  >(
    `
      SELECT
        u.id,
        u.email,
        u.google_sub,
        u.full_name,
        u.photo_url,
        u.status,
        u.last_login_at,
        u.onboarding_step,
        u.onboarding_completed,
        u.onboarding_seen_at,
        r.code AS role_code,
        c.code AS coordination_code
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      LEFT JOIN coordinations c ON c.id = u.coordination_id
      ORDER BY LOWER(u.email)
    `,
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email.trim().toLowerCase(),
    googleSub: row.google_sub,
    fullName: row.full_name,
    photoUrl: row.photo_url,
    status: row.status,
    lastLoginAt: row.last_login_at,
    onboardingStep: row.onboarding_step,
    onboardingCompleted: row.onboarding_completed,
    onboardingSeenAt: row.onboarding_seen_at,
    roleCode: row.role_code,
    coordinationCode: row.coordination_code,
  }));
}

async function syncReferencedCoordinations(
  cloudDataSource: DataSource,
  localDataSource: DataSource,
  coordinationCodes: string[],
): Promise<{ created: number; updated: number }> {
  if (coordinationCodes.length === 0) {
    return { created: 0, updated: 0 };
  }

  const cloudCoordinations = await cloudDataSource.query<
    Array<{
      code: string;
      name: string;
      short_name: string;
      description: string | null;
      color: string;
      icon: string;
      image_asset: string;
      display_order: number;
      is_active: boolean;
    }>
  >(
    `
      SELECT
        code,
        name,
        short_name,
        description,
        color,
        icon,
        image_asset,
        display_order,
        is_active
      FROM coordinations
      WHERE code = ANY($1::text[])
      ORDER BY display_order, code
    `,
    [coordinationCodes],
  );

  return localDataSource.transaction(async (manager) => {
    const repository = manager.getRepository(Coordination);
    let created = 0;
    let updated = 0;

    for (const item of cloudCoordinations) {
      const existing = await repository.findOne({ where: { code: item.code } });

      if (existing) {
        await repository.save({
          ...existing,
          name: item.name,
          shortName: item.short_name,
          description: item.description,
          color: item.color,
          icon: item.icon,
          imageAsset: item.image_asset,
          displayOrder: item.display_order,
          isActive: item.is_active,
        });
        updated += 1;
        continue;
      }

      await repository.save(
        repository.create({
          code: item.code,
          name: item.name,
          shortName: item.short_name,
          description: item.description,
          color: item.color,
          icon: item.icon,
          imageAsset: item.image_asset,
          displayOrder: item.display_order,
          isActive: item.is_active,
        }),
      );
      created += 1;
    }

    return { created, updated };
  });
}

export async function syncUsersFromCloud(): Promise<SyncUsersFromCloudResult> {
  const cloudDataSource = new DataSource(buildCloudDataSourceOptions());
  const localDataSource = new DataSource(buildDataSourceOptions());

  await cloudDataSource.initialize();
  await localDataSource.initialize();

  try {
    const cloudUsers = await fetchCloudUsers(cloudDataSource);
    const coordinationCodes = [
      ...new Set(
        cloudUsers
          .map((user) => user.coordinationCode)
          .filter((code): code is string => code !== null),
      ),
    ];

    const coordinationCounters = await syncReferencedCoordinations(
      cloudDataSource,
      localDataSource,
      coordinationCodes,
    );

    const userCounters = await localDataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const roleRepository = manager.getRepository(Role);
      const coordinationRepository = manager.getRepository(Coordination);

      const rolesByCode = new Map(
        (await roleRepository.find()).map((role) => [role.code, role]),
      );
      const coordinationsByCode = new Map(
        (await coordinationRepository.find()).map((coordination) => [
          coordination.code,
          coordination,
        ]),
      );

      let usersCreated = 0;
      let usersUpdated = 0;
      let usersSkipped = 0;

      for (const cloudUser of cloudUsers) {
        const role = rolesByCode.get(cloudUser.roleCode);
        if (!role) {
          console.warn(
            `Omitiendo ${cloudUser.email}: rol local no encontrado (${cloudUser.roleCode})`,
          );
          usersSkipped += 1;
          continue;
        }

        let coordinationId: string | null = null;
        if (cloudUser.coordinationCode) {
          const coordination = coordinationsByCode.get(
            cloudUser.coordinationCode,
          );
          if (!coordination) {
            console.warn(
              `Omitiendo ${cloudUser.email}: coordinación local no encontrada (${cloudUser.coordinationCode})`,
            );
            usersSkipped += 1;
            continue;
          }
          coordinationId = coordination.id;
        }

        const existing = await userRepository
          .createQueryBuilder('user')
          .where('LOWER(user.email) = :email', { email: cloudUser.email })
          .getOne();

        const payload = {
          email: cloudUser.email,
          googleSub: cloudUser.googleSub,
          fullName: cloudUser.fullName,
          photoUrl: cloudUser.photoUrl,
          roleId: role.id,
          coordinationId,
          status: cloudUser.status,
          lastLoginAt: cloudUser.lastLoginAt,
          onboardingStep: cloudUser.onboardingStep,
          onboardingCompleted: cloudUser.onboardingCompleted,
          onboardingSeenAt: cloudUser.onboardingSeenAt,
        };

        if (existing) {
          await userRepository.save({ ...existing, ...payload });
          usersUpdated += 1;
          continue;
        }

        await userRepository.save(
          userRepository.create({
            ...payload,
            id: cloudUser.id,
          }),
        );
        usersCreated += 1;
      }

      return {
        created: usersCreated,
        updated: usersUpdated,
        skipped: usersSkipped,
      };
    });

    return {
      coordinationsCreated: coordinationCounters.created,
      coordinationsUpdated: coordinationCounters.updated,
      usersCreated: userCounters.created,
      usersUpdated: userCounters.updated,
      usersSkipped: userCounters.skipped,
      cloudUserCount: cloudUsers.length,
    };
  } finally {
    await cloudDataSource.destroy();
    await localDataSource.destroy();
  }
}
