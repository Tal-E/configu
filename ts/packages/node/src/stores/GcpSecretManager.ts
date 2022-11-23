import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { KeyValueStore } from '@configu/ts';

type GcpSecretManagerConfiguration = { keyFile: string; projectId: string };

export class GcpSecretManagerStore extends KeyValueStore {
  static readonly scheme = 'gcp-secret-manager';
  private client: SecretManagerServiceClient;
  private projectId: string;

  constructor({ keyFile, projectId }: GcpSecretManagerConfiguration) {
    super(GcpSecretManagerStore.scheme, { keySeparator: '-' });

    this.client = new SecretManagerServiceClient({ keyFile });
    this.projectId = projectId;
  }

  async init() {
    super.init(this.projectId);
  }

  private formatKey(key: string): string {
    return `projects/${this.projectId}/secrets/${key}`;
  }

  // * https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets#access
  async getByKey(key: string): Promise<string> {
    const [accessResponse] = await this.client.accessSecretVersion({
      name: `${this.formatKey(key)}/versions/latest`,
    });
    const secret = accessResponse?.payload?.data?.toString();
    return secret ?? '';
  }

  // * https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets#add-secret-version
  private addSecretVersion = async (secretId: string, stringifiedSecretData: string) => {
    await this.client.addSecretVersion({
      parent: secretId,
      payload: {
        data: Buffer.from(stringifiedSecretData, 'utf-8'),
      },
    });
  };

  // * https://cloud.google.com/secret-manager/docs/creating-and-accessing-secrets#create
  async upsert(key: string, value: string): Promise<void> {
    const formattedKey = this.formatKey(key);
    try {
      await this.client.createSecret({
        parent: `projects/${this.projectId}`,
        secretId: key,
        secret: {
          replication: {
            automatic: {},
          },
        },
      });

      await this.addSecretVersion(formattedKey, value);
    } catch (error) {
      await this.addSecretVersion(formattedKey, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.deleteSecret({ name: this.formatKey(key) });
  }
}