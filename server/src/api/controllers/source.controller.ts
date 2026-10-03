import type { Request, Response } from 'express';
import { GitHubSourceService, SourceResolutionError } from '../../source/index.js';
import { ApiResponse, SourceResolutionDto } from '../api.types.js';

export class SourceController {
  private readonly githubSourceService: GitHubSourceService;

  constructor(githubSourceService?: GitHubSourceService) {
    this.githubSourceService = githubSourceService ?? new GitHubSourceService();
  }

  resolveSource = async (
    req: Request,
    res: Response<ApiResponse<SourceResolutionDto>>
  ): Promise<void> => {
    try {
      const { repositoryUrl, ref } = req.body;

      if (!repositoryUrl || typeof repositoryUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_URL',
            message: 'Field "repositoryUrl" is required and must be a valid GitHub HTTPS URL',
          },
        });
        return;
      }

      const resolution = await this.githubSourceService.resolveSource({
        repositoryUrl,
        ref,
      });

      res.status(200).json({
        success: true,
        data: resolution,
      });
    } catch (err) {
      if (err instanceof SourceResolutionError) {
        res.status(err.statusCode).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
          },
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'SOURCE_RESOLUTION_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  };
}
