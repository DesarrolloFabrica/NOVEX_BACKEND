import { DataSource, EntityManager } from 'typeorm';
import { UserStatus } from '../../common/enums/identity.enums';
import { Coordination } from '../../coordinations/entities/coordination.entity';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../users/entities/user.entity';

export interface OperacionesCoordinationSeed {
  code: string;
  name: string;
  shortName: string;
  description: string | null;
  color: string;
  icon: string;
  imageAsset: string;
  displayOrder: number;
  isActive: boolean;
}

export interface OperacionesUserSeed {
  email: string;
  fullName: string;
  /** Códigos de rol del catálogo: ADMIN, DIRECTOR, ANALISTA, COORDINADOR */
  roleCode: 'ADMIN' | 'DIRECTOR' | 'ANALISTA' | 'COORDINADOR';
  /** Código de coordinación o null si no tiene asignación */
  coordinationCode: string | null;
}

/** Coordinaciones permitidas — no crear ninguna otra en este seed. */
export const OPERACIONES_COORDINATIONS: readonly OperacionesCoordinationSeed[] =
  [
    {
      code: 'coord-general',
      name: 'Coordinación General',
      shortName: 'General',
      description: null,
      color: '#4F8EF7',
      icon: 'coord-general',
      imageAsset: 'CoordGeneral.png',
      displayOrder: 1,
      isActive: true,
    },
    {
      code: 'coord-b2b',
      name: 'COORDINACION SUPERVISOR B2B',
      shortName: 'B2B',
      description: null,
      color: '#7C5CFF',
      icon: 'coord-b2b',
      imageAsset: 'CoordB2B.png',
      displayOrder: 2,
      isActive: true,
    },
    {
      code: 'coord-bellas-artes',
      name: 'Coordinador Bellas Artes',
      shortName: 'Bellas Artes',
      description: null,
      color: '#E255A1',
      icon: 'coord-bellas-artes',
      imageAsset: 'CoordBellasartes.png',
      displayOrder: 3,
      isActive: true,
    },
    {
      code: 'coord-desarrollo-profesional',
      name: 'Coordinador Desarrollo Profesional',
      shortName: 'Desarrollo Prof.',
      description: null,
      color: '#2EC4B6',
      icon: 'coord-desarrollo-profesional',
      imageAsset: 'CoordDesarrolloprof.png',
      displayOrder: 4,
      isActive: true,
    },
    {
      code: 'coord-social-lab',
      name: 'COORDINADOR DE SOCIAL - SOCIAL LAB',
      shortName: 'Social Lab',
      description: null,
      color: '#FF8A5B',
      icon: 'coord-social-lab',
      imageAsset: 'CoordSociallab.png',
      displayOrder: 5,
      isActive: true,
    },
    {
      code: 'coord-empresarial',
      name: 'Coordinador Empresarial',
      shortName: 'Empresarial',
      description: null,
      color: '#5B7CFA',
      icon: 'coord-empresarial',
      imageAsset: 'CoordB2B.png',
      displayOrder: 6,
      isActive: true,
    },
    {
      code: 'coord-especializaciones',
      name: 'Coordinador Especializaciones',
      shortName: 'Especializaciones',
      description: null,
      color: '#36B37E',
      icon: 'coord-especializaciones',
      imageAsset: 'CoordDesarrolloprof.png',
      displayOrder: 7,
      isActive: true,
    },
    {
      code: 'coord-ingenierias',
      name: 'Coordinador Ingenierías',
      shortName: 'Ingenierías',
      description: null,
      color: '#00B8D9',
      icon: 'coord-ingenierias',
      imageAsset: 'CoordGeneral.png',
      displayOrder: 8,
      isActive: true,
    },
    {
      code: 'coord-operaciones-academicas',
      name: 'Coordinador Operaciones Académicas',
      shortName: 'Op. Académicas',
      description: null,
      color: '#6554C0',
      icon: 'coord-operaciones-academicas',
      imageAsset: 'CoordDesarrolloprof.png',
      displayOrder: 9,
      isActive: true,
    },
    {
      code: 'coord-proyeccion-social',
      name: 'Coordinador Proyección Social',
      shortName: 'Proyección Social',
      description: null,
      color: '#FFAB00',
      icon: 'coord-proyeccion-social',
      imageAsset: 'CoordSociallab.png',
      displayOrder: 10,
      isActive: true,
    },
    {
      code: 'coord-saber-pro',
      name: 'Coordinador Saber Pro',
      shortName: 'Saber Pro',
      description: null,
      color: '#2684FF',
      icon: 'coord-saber-pro',
      imageAsset: 'CoordDesarrolloprof.png',
      displayOrder: 11,
      isActive: true,
    },
    {
      code: 'coord-transversales',
      name: 'Coordinador Transversales',
      shortName: 'Transversales',
      description: null,
      color: '#57D9A3',
      icon: 'coord-transversales',
      imageAsset: 'CoordGeneral.png',
      displayOrder: 12,
      isActive: true,
    },
    {
      code: 'coord-homologaciones',
      name: 'Homologaciones',
      shortName: 'Homologaciones',
      description: null,
      color: '#5243AA',
      icon: 'coord-homologaciones',
      imageAsset: 'CoordDesarrolloprof.png',
      displayOrder: 13,
      isActive: true,
    },
    {
      code: 'coord-negocios',
      name: 'NEGOCIOS',
      shortName: 'Negocios',
      description: null,
      color: '#5243AA',
      icon: 'coord-negocios',
      imageAsset: 'CoordB2B.png',
      displayOrder: 14,
      isActive: true,
    },
    {
      code: 'coord-fabrica-contenidos',
      name: 'Fabrica de contenidos',
      shortName: 'Fábrica',
      description: null,
      color: '#00B8D9',
      icon: 'coord-fabrica-contenidos',
      imageAsset: 'CoordGeneral.png',
      displayOrder: 15,
      isActive: true,
    },
  ] as const;

export const OPERACIONES_USERS: readonly OperacionesUserSeed[] = [
  {
    email: 'alejandro_castro@cun.edu.co',
    fullName: 'ALEJANDRO CASTRO SANCHEZ',
    roleCode: 'ADMIN',
    coordinationCode: null,
  },
  {
    email: 'camilo_quintero@cun.edu.co',
    fullName: 'CAMILO QUINTERO',
    roleCode: 'ADMIN',
    coordinationCode: null,
  },
  {
    email: 'direccion_operaciones@cun.edu.co',
    fullName: 'DIRECCION OPERACIONES',
    roleCode: 'ADMIN',
    coordinationCode: null,
  },
  {
    email: 'desarrollofabrica@cun.edu.co',
    fullName: 'Desarrollo Fabrica',
    roleCode: 'ADMIN',
    coordinationCode: null,
  },
  {
    email: 'iron_fuentes@cun.edu.co',
    fullName: 'IRON FUENTES',
    roleCode: 'DIRECTOR',
    coordinationCode: null,
  },
  {
    email: 'sara_murillofo@cun.edu.co',
    fullName: 'SARA MURILLO FONSECA',
    roleCode: 'ANALISTA',
    coordinationCode: null,
  },
  {
    email: 'alberto_valencia@cun.edu.co',
    fullName: 'ALBERTO MARIO VALENCIA ZABLEH',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-bellas-artes',
  },
  {
    email: 'alex_navia@cun.edu.co',
    fullName: 'ALEX ROVIRO NAVIA DIAZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-saber-pro',
  },
  {
    email: 'diana_gomez@cun.edu.co',
    fullName: 'DIANA PAOLA GOMEZ GONZALEZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-saber-pro',
  },
  {
    email: 'andres_prieto@cun.edu.co',
    fullName: 'ANDRES FELIPE PRIETO LIZARAZO',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-negocios',
  },
  {
    email: 'aura_royero@cun.edu.co',
    fullName: 'AURA MARCELA ROYERO VERGARA',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-empresarial',
  },
  {
    email: 'carlos_rodriguezs@cun.edu.co',
    fullName: 'CARLOS ANDRES RODRIGUEZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-bellas-artes',
  },
  {
    email: 'director.demo@cun.edu.co',
    fullName: 'director.demo',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-desarrollo-profesional',
  },
  {
    email: 'ingrid_vargas@cun.edu.co',
    fullName: 'INGRID JULIANA VARGAS BELTRAN',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-homologaciones',
  },
  {
    email: 'lorena_gomez@cun.edu.co',
    fullName: 'LORENA GOMEZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-fabrica-contenidos',
  },
  {
    email: 'johan_dazasar@cun.edu.co',
    fullName: 'JOHAN SEBASTIAN DAZA SARMIENTO',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-fabrica-contenidos',
  },
  {
    email: 'sara_martinezl@cun.edu.co',
    fullName: 'SARA MARTINEZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-fabrica-contenidos',
  },
  {
    email: 'jonh_cuevas@cun.edu.co',
    fullName: 'JONH CESAR CUEVAS MUÑOZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-b2b',
  },
  {
    email: 'raul_valencia@cun.edu.co',
    fullName: 'RAUL VALENCIA CIFUENTES',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-general',
  },
  {
    email: 'leidy_bernal@cun.edu.co',
    fullName: 'LEIDY VIVIANA BERNAL LEÓN',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-operaciones-academicas',
  },
  {
    email: 'liliana_villamizar@cun.edu.co',
    fullName: 'LILIANA VILLAMIZAR PEREZ',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-proyeccion-social',
  },
  {
    email: 'proyeccion_social@cun.edu.co',
    fullName: 'PROYECCIÓN SOCIAL',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-proyeccion-social',
  },
  {
    email: 'maira_doncel@cun.edu.co',
    fullName: 'MAIRA ALEJANDRA DONCEL LARGO',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-transversales',
  },
  {
    email: 'tania_rocha@cun.edu.co',
    fullName: 'TANIA LIZETH ROCHA CONTRERAS',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-especializaciones',
  },
  {
    email: 'viviana_cabrera@cun.edu.co',
    fullName: 'VIVIANA ANDREA CABRERA CABRERA',
    roleCode: 'COORDINADOR',
    coordinationCode: 'coord-ingenierias',
  },
  {
    email: 'sara_murrillo@cun.edu.co',
    fullName: 'sara_murrillo',
    roleCode: 'COORDINADOR',
    coordinationCode: null,
  },
  {
    email: 'jose_camachoc@cun.edu.co',
    fullName: 'JOSE CAMACHO C',
    roleCode: 'COORDINADOR',
    coordinationCode: null,
  },
] as const;

export interface OperacionesSeedResult {
  coordinationsCreated: number;
  coordinationsUpdated: number;
  usersCreated: number;
  usersUpdated: number;
  assignments: OperacionesAssignmentSummary[];
}

export interface OperacionesAssignmentSummary {
  email: string;
  fullName: string;
  roleCode: string;
  coordinationCode: string | null;
  coordinationName: string | null;
}

export async function runOperacionesSeed(
  dataSource: DataSource,
): Promise<OperacionesSeedResult> {
  return dataSource.transaction(async (manager) => {
    const coordinationCounters = await seedCoordinations(manager);
    const coordinationsByCode = await loadCoordinationsByCode(manager);
    const userCounters = await seedUsers(manager, coordinationsByCode);
    const assignments = await buildAssignmentSummary(manager);

    return {
      coordinationsCreated: coordinationCounters.created,
      coordinationsUpdated: coordinationCounters.updated,
      usersCreated: userCounters.created,
      usersUpdated: userCounters.updated,
      assignments,
    };
  });
}

async function loadCoordinationsByCode(
  manager: EntityManager,
): Promise<Map<string, Coordination>> {
  const coordinations = await manager.getRepository(Coordination).find();
  return new Map(
    coordinations.map((coordination) => [coordination.code, coordination]),
  );
}

async function seedCoordinations(manager: EntityManager): Promise<{
  created: number;
  updated: number;
}> {
  const repository = manager.getRepository(Coordination);
  let coordinationsCreated = 0;
  let coordinationsUpdated = 0;

  for (const item of OPERACIONES_COORDINATIONS) {
    const existing = await repository.findOne({ where: { code: item.code } });

    if (existing) {
      await repository.save({
        ...existing,
        name: item.name,
        shortName: item.shortName,
        description: item.description,
        color: item.color,
        icon: item.icon,
        imageAsset: item.imageAsset,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
      });
      coordinationsUpdated += 1;
      continue;
    }

    await repository.save(
      repository.create({
        code: item.code,
        name: item.name,
        shortName: item.shortName,
        description: item.description,
        color: item.color,
        icon: item.icon,
        imageAsset: item.imageAsset,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
      }),
    );
    coordinationsCreated += 1;
  }

  return { created: coordinationsCreated, updated: coordinationsUpdated };
}

async function seedUsers(
  manager: EntityManager,
  coordinationsByCode: Map<string, Coordination>,
): Promise<{ created: number; updated: number }> {
  const userRepository = manager.getRepository(User);
  const roleRepository = manager.getRepository(Role);

  const rolesByCode = new Map<string, Role>();
  const roles = await roleRepository.find();
  for (const role of roles) {
    rolesByCode.set(role.code, role);
  }

  const requiredRoles = ['ADMIN', 'DIRECTOR', 'ANALISTA', 'COORDINADOR'];
  for (const roleCode of requiredRoles) {
    if (!rolesByCode.has(roleCode)) {
      throw new Error(
        `Rol requerido no encontrado: ${roleCode}. Ejecuta el catálogo de roles antes del seed.`,
      );
    }
  }

  let usersCreated = 0;
  let usersUpdated = 0;

  for (const item of OPERACIONES_USERS) {
    const normalizedEmail = item.email.trim().toLowerCase();
    const role = rolesByCode.get(item.roleCode);
    if (!role) {
      throw new Error(`Rol no encontrado: ${item.roleCode}`);
    }

    let coordinationId: string | null = null;
    if (item.coordinationCode) {
      const coordination = coordinationsByCode.get(item.coordinationCode);
      if (!coordination) {
        throw new Error(
          `Coordinación no encontrada para usuario ${normalizedEmail}: ${item.coordinationCode}`,
        );
      }
      coordinationId = coordination.id;
    }

    const existing = await userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = :email', { email: normalizedEmail })
      .getOne();

    if (existing) {
      await userRepository.save({
        ...existing,
        fullName: item.fullName,
        roleId: role.id,
        coordinationId,
        status: UserStatus.ACTIVE,
      });
      usersUpdated += 1;
      continue;
    }

    await userRepository.save(
      userRepository.create({
        email: normalizedEmail,
        fullName: item.fullName,
        roleId: role.id,
        coordinationId,
        status: UserStatus.ACTIVE,
        googleSub: null,
        photoUrl: null,
        lastLoginAt: null,
      }),
    );
    usersCreated += 1;
  }

  return { created: usersCreated, updated: usersUpdated };
}

async function buildAssignmentSummary(
  manager: EntityManager,
): Promise<OperacionesAssignmentSummary[]> {
  const emails = OPERACIONES_USERS.map((user) =>
    user.email.trim().toLowerCase(),
  );

  const users = await manager
    .getRepository(User)
    .createQueryBuilder('user')
    .leftJoinAndSelect('user.role', 'role')
    .leftJoinAndSelect('user.coordination', 'coordination')
    .where('LOWER(user.email) IN (:...emails)', { emails })
    .orderBy('role.code', 'ASC')
    .addOrderBy('user.email', 'ASC')
    .getMany();

  return users.map((user) => ({
    email: user.email,
    fullName: user.fullName,
    roleCode: user.role.code,
    coordinationCode: user.coordination?.code ?? null,
    coordinationName: user.coordination?.name ?? null,
  }));
}
