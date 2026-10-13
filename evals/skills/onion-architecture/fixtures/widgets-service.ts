// server/src/modules/widgets/service.ts
import { PgWidgetRepository } from './repository.js';
import { OpenAIEmbedder } from '../../adapters/embedder/openai.js';
import type { Container } from '../../platform/container.js';

export class WidgetService {
  private readonly repo: PgWidgetRepository;
  private readonly embedder: OpenAIEmbedder;

  constructor(private readonly container: Container) {
    this.repo = new PgWidgetRepository(container.db);
    this.embedder = new OpenAIEmbedder(process.env.OPENAI_API_KEY!);
  }

  async findSimilar(workspaceId: string, text: string) {
    const [vector] = await this.embedder.embed([text]);
    return this.repo.nearest(workspaceId, vector, 10);
  }
}
