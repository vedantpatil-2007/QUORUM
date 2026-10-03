import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { BuildersRepository } from '../../db/repositories/builders.repository.js';
import { ApiResponse, BuilderDto } from '../api.types.js';
import { getSingleParam } from '../middleware/request-validation.js';

export class BuildersController {
  private readonly buildersRepo: BuildersRepository;

  constructor(db: Database.Database) {
    this.buildersRepo = new BuildersRepository(db);
  }

  getBuilders = (_req: Request, res: Response<ApiResponse<BuilderDto[]>>): void => {
    const builders = this.buildersRepo.getAllBuilders();

    // Map to DTO — strictly omitting any private key or sensitive fields
    const builderDtos: BuilderDto[] = builders.map((b) => ({
      id: b.id,
      name: b.name,
      publicKey: b.public_key,
      keyType: b.key_type,
      operatorIdentity: b.operator_identity,
      status: b.status,
      registeredAt: b.registered_at,
    }));

    res.status(200).json({
      success: true,
      data: builderDtos,
    });
  };

  getBuilderById = (req: Request, res: Response<ApiResponse<BuilderDto>>): void => {
    const builderId = getSingleParam(req.params.builderId);
    const builder = this.buildersRepo.getBuilderById(builderId);

    if (!builder) {
      res.status(404).json({
        success: false,
        error: {
          code: 'BUILDER_NOT_FOUND',
          message: `Builder with ID '${builderId}' was not found`,
        },
      });
      return;
    }

    const builderDto: BuilderDto = {
      id: builder.id,
      name: builder.name,
      publicKey: builder.public_key,
      keyType: builder.key_type,
      operatorIdentity: builder.operator_identity,
      status: builder.status,
      registeredAt: builder.registered_at,
    };

    res.status(200).json({
      success: true,
      data: builderDto,
    });
  };
}
