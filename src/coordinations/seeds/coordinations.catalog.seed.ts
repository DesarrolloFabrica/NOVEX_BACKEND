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
export const IMPACT_AREA_COORDINATION_CODE: Readonly<Record<string, string>> = {
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
    color: '#28C8F4',
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
    color: '#FF5F66',
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
    color: '#6F7CFF',
    icon: 'coord-bellas-artes',
    imageAsset: 'CoordBellasArtes.png',
    displayOrder: 3,
    isActive: true,
  },
  {
    code: 'coord-desarrollo-profesional',
    name: 'Coordinador Desarrollo Profesional',
    shortName: 'Desarrollo Prof.',
    description: null,
    color: '#B267FF',
    icon: 'coord-desarrollo-profesional',
    imageAsset: 'CoordDesarrolloprof.png',
    displayOrder: 4,
    isActive: true,
  },
  {
    code: 'coord-empresarial',
    name: 'Coordinador Empresarial',
    shortName: 'Empresarial',
    description: null,
    color: '#A95CFF',
    icon: 'coord-empresarial',
    imageAsset: 'CoordTransformacionEmpresarial.png',
    displayOrder: 5,
    isActive: true,
  },
  {
    code: 'coord-especializaciones',
    name: 'Coordinador Especializaciones',
    shortName: 'Especializaciones',
    description: null,
    color: '#FF626A',
    icon: 'coord-especializaciones',
    imageAsset: 'CoordEspecializaciones.png',
    displayOrder: 6,
    isActive: true,
  },
  {
    code: 'coord-ingenierias',
    name: 'Coordinador Ingenierías',
    shortName: 'Ingenierías',
    description: null,
    color: '#FF8A2A',
    icon: 'coord-ingenierias',
    imageAsset: 'CoordIngenierias.png',
    displayOrder: 7,
    isActive: true,
  },
  {
    code: 'coord-operaciones-academicas',
    name: 'Coordinador Operaciones Académicas',
    shortName: 'Op. Académicas',
    description: null,
    color: '#8FA7C8',
    icon: 'coord-operaciones-academicas',
    imageAsset: 'CoordOperacionesAcademicas.png',
    displayOrder: 8,
    isActive: true,
  },
  {
    code: 'coord-proyeccion-social',
    name: 'Coordinador Proyección Social',
    shortName: 'Proyección Social',
    description: null,
    color: '#88AD5A',
    icon: 'coord-proyeccion-social',
    imageAsset: 'CoordProyeccionAcademica.png',
    displayOrder: 9,
    isActive: true,
  },
  {
    code: 'coord-saber-pro',
    name: 'Coordinador Saber Pro',
    shortName: 'Saber Pro',
    description: null,
    color: '#9ACD50',
    icon: 'coord-saber-pro',
    imageAsset: 'CoordSaberPro.png',
    displayOrder: 10,
    isActive: true,
  },
  {
    code: 'coord-transversales',
    name: 'Coordinador Transversales',
    shortName: 'Transversales',
    description: null,
    color: '#FF9A28',
    icon: 'coord-transversales',
    imageAsset: 'CoordTransversales.png',
    displayOrder: 11,
    isActive: true,
  },
  {
    code: 'coord-negocios',
    name: 'Negocios',
    shortName: 'Negocios',
    description: null,
    color: '#FF7B20',
    icon: 'coord-negocios',
    imageAsset: 'CoordNegocios.png',
    displayOrder: 13,
    isActive: true,
  },
  {
    code: 'coord-homologaciones',
    name: 'Homologaciones',
    shortName: 'Homologaciones',
    description: null,
    color: '#FF6978',
    icon: 'coord-homologaciones',
    imageAsset: 'CoordHomologaciones.png',
    displayOrder: 12,
    isActive: true,
  },
  {
    code: 'coord-fabrica-contenidos',
    name: 'Fabrica de contenidos',
    shortName: 'Fábrica',
    description: null,
    color: '#22D3E5',
    icon: 'coord-fabrica-contenidos',
    imageAsset: 'CoordFabricaDeContenido.png',
    displayOrder: 14,
    isActive: true,
  },
  {
    code: 'coord-servicios',
    name: 'Servicios',
    shortName: 'Servicios',
    description: null,
    color: '#C050FF',
    icon: 'coord-servicios',
    imageAsset: 'CoordServicios.png',
    displayOrder: 15,
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
