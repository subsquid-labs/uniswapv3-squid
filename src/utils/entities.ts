import type {Store} from '@subsquid/typeorm-store'
import {In} from 'typeorm'
import {splitIntoBatches} from './tools'

export interface EntityClass<T extends Entity> {
    new (props?: any): T
}

export interface Entity {
    id: string
}

/**
 * In-memory working set for one batch.
 *
 * This deliberately does not fetch on access. The predecessor did - it took a
 * list of deferred ids, then let mappings `await` any entity at any point and
 * silently queried for anything missing. That made the read pattern invisible:
 * a single forgotten `defer` turned into a per-event round trip, and the order
 * in which entities were built was implicit in whichever handler happened to
 * ask first.
 *
 * Here `load()` is the only thing that talks to the database and `get()` is
 * synchronous, so each level of the entity graph has to state what it needs
 * before it computes anything. A miss is a bug in the level ordering, not a
 * cache miss to be papered over with a query.
 */
export class Entities {
    private maps = new Map<EntityClass<any>, Map<string, any>>()
    private dirty = new Map<EntityClass<any>, Set<string>>()

    constructor(private store: Store) {}

    /** Bulk-fetches the given ids. Ids already in memory are not re-fetched. */
    async load<T extends Entity>(cls: EntityClass<T>, ids: Iterable<string>): Promise<Map<string, T>> {
        const map = this.mapFor(cls)
        const missing = [...new Set(ids)].filter((id) => !map.has(id))

        for (const batch of splitIntoBatches(missing, 1000)) {
            const rows = await this.store.findBy(cls as any, {id: In(batch)} as any)
            for (const row of rows as T[]) map.set(row.id, row)
        }

        return map
    }

    get<T extends Entity>(cls: EntityClass<T>, id: string): T | undefined {
        return this.mapFor(cls).get(id)
    }

    getOrFail<T extends Entity>(cls: EntityClass<T>, id: string): T {
        const value = this.mapFor(cls).get(id)
        if (value == null) {
            throw new Error(`${cls.name} ${id} was not loaded - add it to this level's load step`)
        }
        return value
    }

    has<T extends Entity>(cls: EntityClass<T>, id: string): boolean {
        return this.mapFor(cls).has(id)
    }

    /** Adds or replaces an entity and marks it for writing. */
    set<T extends Entity>(entity: T): T {
        const cls = entity.constructor as EntityClass<T>
        this.mapFor(cls).set(entity.id, entity)
        let dirty = this.dirty.get(cls)
        if (dirty == null) {
            dirty = new Set()
            this.dirty.set(cls, dirty)
        }
        dirty.add(entity.id)
        return entity
    }

    values<T extends Entity>(cls: EntityClass<T>): T[] {
        return [...this.mapFor(cls).values()]
    }

    /**
     * Writes everything modified in this batch, in the given order, so that a
     * row is never written before the rows it references.
     *
     * Everything is upserted rather than inserted, including the append-only
     * entities. The passes replay one block range several times, and a
     * transaction that touches pools assigned to different passes is seen by
     * each of them, so its Tx row gets written more than once.
     */
    async persist(order: EntityClass<any>[]): Promise<void> {
        for (const cls of order) {
            const dirty = this.dirty.get(cls)
            if (dirty == null || dirty.size === 0) continue
            const map = this.mapFor(cls)
            const rows = [...dirty].map((id) => map.get(id)).filter((row) => row != null)
            if (rows.length > 0) await this.store.upsert(rows)
            dirty.clear()
        }
    }

    private mapFor<T extends Entity>(cls: EntityClass<T>): Map<string, T> {
        let map = this.maps.get(cls)
        if (map == null) {
            map = new Map()
            this.maps.set(cls, map)
        }
        return map
    }
}
