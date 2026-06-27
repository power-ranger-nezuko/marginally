import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class XeroClient {
  private readonly logger = new Logger(XeroClient.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tokenEndpoint = 'https://identity.xero.com/connect/token';

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('XERO_CLIENT_ID', '');
    this.clientSecret = config.get<string>('XERO_CLIENT_SECRET', '');
    this.redirectUri = config.get<string>('XERO_REDIRECT_URI', '');
  }

  async exchangeCodeForTokens(authCode: string): Promise<XeroTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Xero token exchange failed: ${error}`);
    }

    return response.json() as Promise<XeroTokenResponse>;
  }

  async refreshTokens(refreshToken: string): Promise<XeroTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Xero token refresh failed: ${error}`);
    }

    return response.json() as Promise<XeroTokenResponse>;
  }

  async createInvoice(
    accessToken: string,
    tenantXeroId: string,
    entry: { amount: number; description: string; txnId: string; currency: string },
  ): Promise<string> {
    const url = 'https://api.xero.com/api.xro/2.0/Invoices';

    const body = {
      Type: 'ACCREC',
      Status: 'AUTHORISED',
      CurrencyCode: entry.currency.toUpperCase(),
      Reference: `Stripe: ${entry.txnId}`,
      LineItems: [
        {
          Description: entry.description,
          Quantity: 1,
          UnitAmount: entry.amount / 100,
          AccountCode: '200',
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'xero-tenant-id': tenantXeroId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Invoices: [body] }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Xero create invoice failed: ${err}`);
    }

    const data = (await response.json()) as { Invoices: Array<{ InvoiceID: string }> };
    return data.Invoices[0].InvoiceID;
  }
}
