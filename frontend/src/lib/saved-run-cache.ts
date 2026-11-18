import { isActive, type Snapshot } from './api';

type Entry = { snapshot: Snapshot; expires: number };
type Pending = { token: symbol; promise: Promise<Snapshot> };

/** In-memory saved reads only. Never starts provider work or stores credentials. */
export class SavedRunCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();
  private epochs = new Map<string, number>();

  constructor(private maxEntries = 8, private completedTtl = 15_000, private activeTtl = 1_000) {}

  peek(id: string): Snapshot | undefined {
    const entry = this.entries.get(id);
    if (!entry || entry.expires <= Date.now()) return undefined;
    this.entries.delete(id); this.entries.set(id, entry);
    return entry.snapshot;
  }

  remember(snapshot: Snapshot): Snapshot {
    const existing = this.entries.get(snapshot.id);
    if (existing && existing.snapshot.revision > snapshot.revision) return existing.snapshot;
    this.entries.delete(snapshot.id);
    this.entries.set(snapshot.id, { snapshot, expires: Date.now() + (isActive(snapshot.status) ? this.activeTtl : this.completedTtl) });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    return snapshot;
  }

  invalidate(id: string) {
    this.entries.delete(id); this.pending.delete(id);
    this.epochs.set(id, (this.epochs.get(id) || 0) + 1);
  }

  load(id: string, read: () => Promise<Snapshot>, force = false): Promise<Snapshot> {
    if (!force) { const cached = this.peek(id); if (cached) return Promise.resolve(cached); }
    const current = this.pending.get(id);
    if (current) return current.promise;
    const token = Symbol(id), epoch = this.epochs.get(id) || 0;
    const promise = read().then(snapshot => {
      // A mutation can finish while an older GET is still travelling. Reuse
      // its newer saved response or join a post-invalidation read instead.
      if ((this.epochs.get(id) || 0) !== epoch) return this.peek(id) || this.load(id, read);
      return this.remember(snapshot);
    }).finally(() => { if (this.pending.get(id)?.token === token) this.pending.delete(id); });
    this.pending.set(id, { token, promise });
    return promise;
  }
}
