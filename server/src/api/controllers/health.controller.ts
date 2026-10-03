import type { Request, Response } from 'express';
import { ApiResponse, HealthResponse } from '../api.types.js';

export class HealthController {
  getHealth(_req: Request, res: Response<ApiResponse<HealthResponse>>): void {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'quorum-api',
        version: '1.0.0',
      },
    });
  }
}
