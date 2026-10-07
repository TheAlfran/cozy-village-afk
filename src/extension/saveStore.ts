import type { Memento } from 'vscode';
import { createDefaultSave, sanitizeSave, SAVE_KEY, type GameSaveV1 } from '../shared/model.js';

export class SaveStore {
  constructor(private readonly storage: Pick<Memento, 'get' | 'update'>) {}

  load(): GameSaveV1 {
    return sanitizeSave(this.storage.get(SAVE_KEY));
  }

  async save(value: unknown): Promise<GameSaveV1> {
    const state = sanitizeSave(value);
    await this.storage.update(SAVE_KEY, state);
    return state;
  }

  async reset(): Promise<GameSaveV1> {
    const state = createDefaultSave();
    await this.storage.update(SAVE_KEY, state);
    return state;
  }
}
