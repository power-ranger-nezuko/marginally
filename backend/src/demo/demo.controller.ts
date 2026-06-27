import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DemoService, ScenarioDto } from './demo.service';

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {
    // Demo routes are intentionally public (no JWT guard).
    // They must never be reachable in production.
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Demo endpoints not available in production',
      );
    }
  }

  /**
   * POST /demo/reset
   *
   * Wipes all demo-tenant data and re-seeds fresh fixtures.
   * Returns the primary demo tenant ID and login credentials.
   */
  @Post('reset')
  async reset(): Promise<{
    message: string;
    tenantId: string;
    loginEmail: string;
    loginPassword: string;
  }> {
    return this.demoService.resetDemo();
  }

  /**
   * GET /demo/scenario/:name
   *
   * Returns a pre-built JSON scenario description for the given name.
   * Valid names: failed-payment | cancellation | dispute | webhook-failure
   */
  @Get('scenario/:name')
  async getScenario(@Param('name') name: string): Promise<ScenarioDto> {
    return this.demoService.getScenario(name);
  }

  /**
   * POST /demo/simulate/:scenario?tenantId=<uuid>
   *
   * Runs a live simulation against the database for the given scenario.
   * Valid scenarios: failed-payment | recovery-email | dispute-won |
   *                  accounting-sync | webhook-failure
   */
  @Post('simulate/:scenario')
  async simulate(
    @Param('scenario') scenario: string,
    @Query('tenantId') tenantId: string,
  ): Promise<unknown> {
    return this.demoService.simulate(scenario, tenantId);
  }
}
