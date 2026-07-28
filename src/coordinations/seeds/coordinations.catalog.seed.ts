/**
 * Catálogo oficial de coordinaciones y grafo institucional.
 * Coordinaciones: coordination-islands.config.ts (frontend).
 * Dependencias: impact-topology.mock.ts → IMPACT_DEPENDENCIES mapeadas vía
 * IMPACT_AREA_COORDINATION_CODE (bindings + aliases del frontend).
 */
import { CoordinationDependencyType } from '../../common/enums/coordination.enums';

export interface CoordinationCatalogItem {
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

export interface CoordinationDependencyCatalogItem {
  sourceImpactAreaId: string;
  targetImpactAreaId: string;
  dependencyType: CoordinationDependencyType;
  dependencyWeight: number;
  bidirectional: boolean;
}

/**
 * Mapeo canónico área de impacto → coordinación.
 * Alineado a IMPACT_AREA_BINDINGS y COORDINATION_ALIASES del frontend.
 */
export const IMPACT_AREA_COORDINATION_CODE: Readonly<
  Record<string, string>
> = {
  planning: 'coord-general',
  infrastructure: 'coord-general',
  technology: 'coord-ingenierias',
  registry: 'coord-saber-pro',
  communications: 'coord-b2b',
  library: 'coord-general',
  lms: 'coord-transversales',
  'academic-direction': 'coord-operaciones-academicas',
  operations: 'coord-empresarial',
  finance: 'coord-general',
  wellbeing: 'coord-proyeccion-social',
  people: 'coord-desarrollo-profesional',
};

export const CATALOG_COORDINATIONS: readonly CoordinationCatalogItem[] = [
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
    name: 'Coordinación Supervisor B2B',
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
    name: 'Coordinador de Social - Social Lab',
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
    code: 'coord-negocios',
    name: 'Negocios',
    shortName: 'Negocios',
    description: null,
    color: '#5243AA',
    icon: 'coord-negocios',
    imageAsset: 'CoordB2B.png',
    displayOrder: 13,
    isActive: true,
  },
] as const;

/** Réplica exacta de IMPACT_DEPENDENCIES (impact-topology.mock.ts). */
export const CATALOG_COORDINATION_DEPENDENCIES: readonly CoordinationDependencyCatalogItem[] =
  [
    {
      sourceImpactAreaId: 'infrastructure',
      targetImpactAreaId: 'technology',
      dependencyType: CoordinationDependencyType.TECHNICAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'technology',
      targetImpactAreaId: 'registry',
      dependencyType: CoordinationDependencyType.TECHNICAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'technology',
      targetImpactAreaId: 'lms',
      dependencyType: CoordinationDependencyType.TECHNICAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'technology',
      targetImpactAreaId: 'library',
      dependencyType: CoordinationDependencyType.TECHNICAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'technology',
      targetImpactAreaId: 'communications',
      dependencyType: CoordinationDependencyType.COMMUNICATION,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'registry',
      targetImpactAreaId: 'finance',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'registry',
      targetImpactAreaId: 'academic-direction',
      dependencyType: CoordinationDependencyType.ACADEMIC,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'lms',
      targetImpactAreaId: 'academic-direction',
      dependencyType: CoordinationDependencyType.ACADEMIC,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'library',
      targetImpactAreaId: 'academic-direction',
      dependencyType: CoordinationDependencyType.ACADEMIC,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'academic-direction',
      targetImpactAreaId: 'wellbeing',
      dependencyType: CoordinationDependencyType.ACADEMIC,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'academic-direction',
      targetImpactAreaId: 'planning',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'communications',
      targetImpactAreaId: 'wellbeing',
      dependencyType: CoordinationDependencyType.COMMUNICATION,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'finance',
      targetImpactAreaId: 'operations',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'wellbeing',
      targetImpactAreaId: 'operations',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'planning',
      targetImpactAreaId: 'people',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'planning',
      targetImpactAreaId: 'operations',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
    {
      sourceImpactAreaId: 'people',
      targetImpactAreaId: 'operations',
      dependencyType: CoordinationDependencyType.OPERATIONAL,
      dependencyWeight: 3,
      bidirectional: false,
    },
  ] as const;
