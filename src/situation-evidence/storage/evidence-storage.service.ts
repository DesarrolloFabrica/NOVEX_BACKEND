import { Injectable } from '@nestjs/common';

export interface EvidenceStorageDescriptor {
  storagePath: string;
  fileName: string;
}

/**
 * Abstracción de almacenamiento de evidencias.
 * Hoy genera rutas locales; en el futuro delegará a Cloud Storage.
 */
@Injectable()
export class EvidenceStorageService {
  buildLocalPath(situationId: string, fileName: string): string {
    return `evidences/${situationId}/${fileName}`;
  }

  resolveStorageDescriptor(
    situationId: string,
    fileName: string,
    storagePath?: string,
  ): EvidenceStorageDescriptor {
    return {
      fileName,
      storagePath: storagePath ?? this.buildLocalPath(situationId, fileName),
    };
  }
}
