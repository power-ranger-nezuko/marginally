import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface QBTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

@Injectable()
export class QuickBooksClient {
  private readonly logger = new Logger(QuickBooksClient.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly tokenEndpoint = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('QB_CLIENT_ID', '');
    this.clientSecret = config.get<string>('QB_CLIENT_SECRET', '');
    this.redirectUri = config.get<string>('QB_REDIRECT_URI', '');
  }

  async exchangeCodeForTokens(authCode: string): Promise<QBTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks token exchange failed: ${error}`);
    }

    return response.json() as Promise<QBTokenResponse>;
  }

  async refreshTokens(refreshToken: string): Promise<QBTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`QuickBooks token refresh failed: ${error}`);
    }

    return response.json() as Promise<QBTokenResponse>;
  }

  async createSalesReceipt(
    accessToken: string,
    realmId: string,
    entry: { amount: number; description: string; txnId: string; currency: string },
  ): Promise<string> {
    const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/salesreceipt`;

    const body = {
      Line: [
        {
          Amount: entry.amount / 100,
          DetailType: 'SalesItemLineDetail',
          SalesItemLineDetail: {
            ItemRef: { value: '1', name: 'Services' },
          },
          Description: entry.description,
        },
      ],
      CurrencyRef: { value: entry.currency.toUpperCase() },
      PrivateNote: `Stripe TxnId: ${entry.txnId}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ SalesReceipt: body }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`QB create sales receipt failed: ${err}`);
    }

    const data = (await response.json()) as { SalesReceipt: { Id: string } };
    return data.SalesReceipt.Id;
  }
}
