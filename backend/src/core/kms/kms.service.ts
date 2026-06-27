import { Injectable } from '@nestjs/common';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

@Injectable()
export class KmsService {
  private readonly client: KMSClient;
  private readonly keyId: string;

  constructor() {
    this.client = new KMSClient({});
    this.keyId = process.env.KMS_KEY_ID ?? '';
  }

  async encrypt(plaintext: string): Promise<string> {
    const command = new EncryptCommand({
      KeyId: this.keyId,
      Plaintext: Buffer.from(plaintext, 'utf-8'),
    });
    const response = await this.client.send(command);
    if (!response.CiphertextBlob) {
      throw new Error('KMS encryption returned empty ciphertext');
    }
    return Buffer.from(response.CiphertextBlob).toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    });
    const response = await this.client.send(command);
    if (!response.Plaintext) {
      throw new Error('KMS decryption returned empty plaintext');
    }
    return Buffer.from(response.Plaintext).toString('utf-8');
  }
}
