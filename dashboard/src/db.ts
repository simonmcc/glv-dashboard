/**
 * IndexedDB cache for offline data access.
 *
 * All data is keyed by contactId so different users on the same device
 * do not share cached data. The `meta` store records when each user's
 * data was last synced from the network.
 */
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase, StoreNames } from 'idb';
import type {
  LearningRecord,
  DisclosureRecord,
  JoiningJourneyRecord,
  SuspensionRecord,
  TeamReviewRecord,
  PermitRecord,
  AwardRecord,
} from './types';

interface GLVDatabase extends DBSchema {
  learningRecords: { key: string; value: LearningRecord[] };
  disclosures:     { key: string; value: DisclosureRecord[] };
  joiningJourney:  { key: string; value: JoiningJourneyRecord[] };
  suspensions:     { key: string; value: SuspensionRecord[] };
  teamReviews:     { key: string; value: TeamReviewRecord[] };
  permits:         { key: string; value: PermitRecord[] };
  awards:          { key: string; value: AwardRecord[] };
  meta:            { key: string; value: { lastSync: number } };
}

export type CacheStore = Exclude<StoreNames<GLVDatabase>, 'meta'>;

let _db: IDBPDatabase<GLVDatabase> | null = null;

async function getDb(): Promise<IDBPDatabase<GLVDatabase>> {
  if (_db) return _db;
  _db = await openDB<GLVDatabase>('glv-dashboard', 1, {
    upgrade(db) {
      db.createObjectStore('learningRecords');
      db.createObjectStore('disclosures');
      db.createObjectStore('joiningJourney');
      db.createObjectStore('suspensions');
      db.createObjectStore('teamReviews');
      db.createObjectStore('permits');
      db.createObjectStore('awards');
      db.createObjectStore('meta');
    },
  });
  return _db;
}

export async function readCache<S extends CacheStore>(
  store: S,
  contactId: string,
): Promise<GLVDatabase[S]['value'] | undefined> {
  const db = await getDb();
  return db.get(store, contactId);
}

export async function writeCache<S extends CacheStore>(
  store: S,
  contactId: string,
  value: GLVDatabase[S]['value'],
): Promise<void> {
  const db = await getDb();
  await db.put(store, value, contactId);
  await db.put('meta', { lastSync: Date.now() }, contactId);
}

export async function readLastSync(contactId: string): Promise<number | null> {
  const db = await getDb();
  const meta = await db.get('meta', contactId);
  return meta?.lastSync ?? null;
}
