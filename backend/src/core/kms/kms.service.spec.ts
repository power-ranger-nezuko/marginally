import { Test, TestingModule } from '@nestjs/testing';
import { KmsService } from './kms.service';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  EncryptCommand: jest.fn().mockImplementation((input) => ({ input })),
  DecryptCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

describe('KmsService', () => {
  let service: KmsService;

  beforeEach(async () => {
    process.env.KMS_KEY_ID = 'arn:aws:kms:us-east-1:123456789:key/test-key';
    const module: TestingModule = await Test.createTestingModule({
      providers: [KmsService],
    }).compile();
    service = module.get<KmsService>(KmsService);
    mockSend.mockReset();
  });

  describe('encrypt', () => {
    it('should return base64 ciphertext', async () => {
      const ciphertextBlob = Buffer.from('encrypted-data');
      mockSend.mockResolvedValueOnce({ CiphertextBlob: ciphertextBlob });

      const result = await service.encrypt('plaintext');

      expect(result).toBe(ciphertextBlob.toString('base64'));
    });

    it('should throw if CiphertextBlob is empty', async () => {
      mockSend.mockResolvedValueOnce({ CiphertextBlob: null });

      await expect(service.encrypt('plaintext')).rejects.toThrow(
        'KMS encryption returned empty ciphertext',
      );
    });
  });

  describe('decrypt', () => {
    it('should return plaintext string', async () => {
      const plaintext = Buffer.from('my-secret');
      mockSend.mockResolvedValueOnce({ Plaintext: plaintext });

      const ciphertext = Buffer.from('some-cipher').toString('base64');
      const result = await service.decrypt(ciphertext);

      expect(result).toBe('my-secret');
    });

    it('should throw if Plaintext is empty', async () => {
      mockSend.mockResolvedValueOnce({ Plaintext: null });

      await expect(service.decrypt('dGVzdA==')).rejects.toThrow(
        'KMS decryption returned empty plaintext',
      );
    });

    it('should roundtrip encrypt then decrypt', async () => {
      const original = 'super-secret-credentials';
      const encrypted = Buffer.from('encrypted');
      mockSend
        .mockResolvedValueOnce({ CiphertextBlob: encrypted })
        .mockResolvedValueOnce({ Plaintext: Buffer.from(original) });

      const cipher = await service.encrypt(original);
      const decrypted = await service.decrypt(cipher);

      expect(decrypted).toBe(original);
    });
  });
});
