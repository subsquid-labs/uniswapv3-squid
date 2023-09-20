import {
  Entity,
  EntityClass,
  FindManyOptions,
  FindOneOptions,
  TypeormDatabase,
} from "@subsquid/typeorm-store";
import { DatabaseHooks, Dest, Table, TableWriter } from "@subsquid/file-store";
import { Database as DB } from "./publicFilestore";
import { HotDatabase } from "@subsquid/util-internal-processor-tools";
//import { DataBuffer, Tables } from "./customDB";
import { S3Dest } from "@subsquid/file-store-s3";
//import { DatabaseOptions } from "./customDB";
import {
  DatabaseState,
  //FinalTxInfo,
  HashAndHeight,
} from "@subsquid/typeorm-store/lib/interfaces";
import { FinalTxInfo } from "@subsquid/util-internal-processor-tools";
//import { Store } from "./customStore";
import { Store as ST } from "./customStore";
import { dbOptions } from "./tables";
import { EntityManager, EntityTarget, FindOptionsWhere } from "typeorm";
import { ChangeTracker } from "@subsquid/typeorm-store/src/hot";
import assert from "assert";
import { ColumnMetadata } from "typeorm/metadata/ColumnMetadata";
export type Database<S> = FinalDatabase<S> | HotDatabase<S>;
export type Tables = Record<string, Table<any>>;
export type DataBuffer<T extends Tables> = {
  [k in keyof T]: TableWriter<T[k] extends Table<infer R> ? R : never>;
};
//implement db with store.
// interface StoreConstructor<T extends Tables> {
//   new (chunk: () => DataBuffer<T>): Store<T>;
// }

export interface DatabaseOptions<T extends Tables, D extends S3Dest> {
  tables: T;
  dest: D;
  chunkSizeMb?: number;
  syncIntervalBlocks?: number;
  hooks?: DatabaseHooks<D>;
}

export interface FinalDatabase<S> {
  supportsHotBlocks?: false;
  connect(): Promise<HashAndHeight>;
  transact(info: FinalTxInfo, cb: (store: S) => Promise<void>): Promise<void>;
}
// class Store{
//   constructor(protected chunk: () => DataBuffer<T>) {}
// }
export type Store<T extends Tables> = Readonly<{
  [k in keyof T]: ToStoreWriter<DataBuffer<T>[k]>;
}> &
  ST<T>;

export class Wrapper<T extends Tables, D extends S3Dest>
  implements FinalDatabase<Store<T>>
{
  orm: TypeormDatabase;
  db: DB<T, D>;

  constructor(dbOptions: DatabaseOptions<T, D>) {
    this.orm = new TypeormDatabase();
    this.db = new DB<T, D>(dbOptions);

    class Store<T extends Tables> {
      //data: Stores<T>;

      constructor(
        private em: () => EntityManager,
        protected chunk: () => DataBuffer<T>,
        private changes?: ChangeTracker
      ) {}

      /**
       * Alias for {@link Store.upsert}
       */
      save<E extends Entity>(entity: E): Promise<void>;
      save<E extends Entity>(entities: E[]): Promise<void>;
      save<E extends Entity>(e: E | E[]): Promise<void> {
        if (Array.isArray(e)) {
          // please the compiler
          return this.upsert(e);
        } else {
          return this.upsert(e);
        }
      }

      /**
       * Upserts a given entity or entities into the database.
       *
       * It always executes a primitive operation without cascades, relations, etc.
       */
      upsert<E extends Entity>(entity: E): Promise<void>;
      upsert<E extends Entity>(entities: E[]): Promise<void>;
      async upsert<E extends Entity>(e: E | E[]): Promise<void> {
        if (Array.isArray(e)) {
          if (e.length == 0) return;
          let entityClass = e[0].constructor as EntityClass<E>;
          for (let i = 1; i < e.length; i++) {
            assert(
              entityClass === e[i].constructor,
              "mass saving allowed only for entities of the same class"
            );
          }
          await this.changes?.trackUpsert(entityClass, e);
          await this.saveMany(entityClass, e);
        } else {
          let entityClass = e.constructor as EntityClass<E>;
          await this.changes?.trackUpsert(entityClass, [e]);
          await this.em().upsert(entityClass, e as any, ["id"]);
        }
      }

      private async saveMany(
        entityClass: EntityClass<any>,
        entities: any[]
      ): Promise<void> {
        assert(entities.length > 0);
        let em = this.em();
        let metadata = em.connection.getMetadata(entityClass);
        let fk = metadata.columns.filter((c) => c.relationMetadata);
        if (fk.length == 0) return this.upsertMany(em, entityClass, entities);
        let currentSignature = this.getFkSignature(fk, entities[0]);
        let batch = [];
        for (let e of entities) {
          let sig = this.getFkSignature(fk, e);
          if (sig === currentSignature) {
            batch.push(e);
          } else {
            await this.upsertMany(em, entityClass, batch);
            currentSignature = sig;
            batch = [e];
          }
        }
        if (batch.length) {
          await this.upsertMany(em, entityClass, batch);
        }
      }

      private getFkSignature(fk: ColumnMetadata[], entity: any): bigint {
        let sig = 0n;
        for (let i = 0; i < fk.length; i++) {
          let bit = fk[i].getEntityValue(entity) === undefined ? 0n : 1n;
          sig |= bit << BigInt(i);
        }
        return sig;
      }

      private async upsertMany(
        em: EntityManager,
        entityClass: EntityClass<any>,
        entities: any[]
      ): Promise<void> {
        for (let b of splitIntoBatches(entities, 1000)) {
          await em.upsert(entityClass, b as any, ["id"]);
        }
      }

      /**
       * Inserts a given entity or entities into the database.
       * Does not check if the entity(s) exist in the database and will fail if a duplicate is inserted.
       *
       * Executes a primitive INSERT operation without cascades, relations, etc.
       */
      insert<E extends Entity>(entity: E): Promise<void>;
      insert<E extends Entity>(entities: E[]): Promise<void>;
      async insert<E extends Entity>(e: E | E[]): Promise<void> {
        if (Array.isArray(e)) {
          if (e.length == 0) return;
          let entityClass = e[0].constructor as EntityClass<E>;
          for (let i = 1; i < e.length; i++) {
            assert(
              entityClass === e[i].constructor,
              "mass saving allowed only for entities of the same class"
            );
          }
          await this.changes?.trackInsert(entityClass, e);
          for (let b of splitIntoBatches(e, 1000)) {
            await this.em().insert(entityClass, b as any);
          }
        } else {
          let entityClass = e.constructor as EntityClass<E>;
          await this.changes?.trackInsert(entityClass, [e]);
          await this.em().insert(entityClass, e as any);
        }
      }

      /**
       * Deletes a given entity or entities from the database.
       *
       * Unlike {@link EntityManager.remove} executes a primitive DELETE query without cascades, relations, etc.
       */
      remove<E extends Entity>(entity: E): Promise<void>;
      remove<E extends Entity>(entities: E[]): Promise<void>;
      remove<E extends Entity>(
        entityClass: EntityClass<E>,
        id: string | string[]
      ): Promise<void>;
      async remove<E extends Entity>(
        e: E | E[] | EntityClass<E>,
        id?: string | string[]
      ): Promise<void> {
        if (id == null) {
          if (Array.isArray(e)) {
            if (e.length == 0) return;
            let entityClass = e[0].constructor as EntityClass<E>;
            for (let i = 1; i < e.length; i++) {
              assert(
                entityClass === e[i].constructor,
                "mass deletion allowed only for entities of the same class"
              );
            }
            let ids = e.map((i) => i.id);
            await this.changes?.trackDelete(entityClass, ids);
            await this.em().delete(entityClass, ids);
          } else {
            let entity = e as E;
            let entityClass = entity.constructor as EntityClass<E>;
            await this.changes?.trackDelete(entityClass, [entity.id]);
            await this.em().delete(entityClass, entity.id);
          }
        } else {
          let entityClass = e as EntityClass<E>;
          await this.changes?.trackDelete(
            entityClass,
            Array.isArray(id) ? id : [id]
          );
          await this.em().delete(entityClass, id);
        }
      }

      async count<E extends Entity>(
        entityClass: EntityClass<E>,
        options?: FindManyOptions<E>
      ): Promise<number> {
        return this.em().count(entityClass, options);
      }

      async countBy<E extends Entity>(
        entityClass: EntityClass<E>,
        where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
      ): Promise<number> {
        return this.em().countBy(entityClass, where);
      }

      async find<E extends Entity>(
        entityClass: EntityClass<E>,
        options?: FindManyOptions<E>
      ): Promise<E[]> {
        return this.em().find(entityClass, options);
      }

      async findBy<E extends Entity>(
        entityClass: EntityClass<E>,
        where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
      ): Promise<E[]> {
        return this.em().findBy(entityClass, where);
      }

      async findOne<E extends Entity>(
        entityClass: EntityClass<E>,
        options: FindOneOptions<E>
      ): Promise<E | undefined> {
        return this.em().findOne(entityClass, options).then(noNull);
      }

      async findOneBy<E extends Entity>(
        entityClass: EntityClass<E>,
        where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
      ): Promise<E | undefined> {
        return this.em().findOneBy(entityClass, where).then(noNull);
      }

      async findOneOrFail<E extends Entity>(
        entityClass: EntityTarget<E>,
        options: FindOneOptions<E>
      ): Promise<E> {
        return this.em().findOneOrFail(entityClass, options);
      }

      async findOneByOrFail<E extends Entity>(
        entityClass: EntityTarget<E>,
        where: FindOptionsWhere<E> | FindOptionsWhere<E>[]
      ): Promise<E> {
        return this.em().findOneByOrFail(entityClass, where);
      }

      get<E extends Entity>(
        entityClass: EntityClass<E>,
        optionsOrId: FindOneOptions<E> | string
      ): Promise<E | undefined> {
        if (typeof optionsOrId == "string") {
          return this.findOneBy(entityClass, { id: optionsOrId } as any);
        } else {
          return this.findOne(entityClass, optionsOrId);
        }
      }
    }

    function* splitIntoBatches<T>(
      list: T[],
      maxBatchSize: number
    ): Generator<T[]> {
      if (list.length <= maxBatchSize) {
        yield list;
      } else {
        let offset = 0;
        while (list.length - offset > maxBatchSize) {
          yield list.slice(offset, offset + maxBatchSize);
          offset += maxBatchSize;
        }
        yield list.slice(offset);
      }
    }

    function noNull<T>(val: null | undefined | T): T | undefined {
      return val == null ? undefined : val;
    }

    for (let name in this.db.tables) {
      Object.defineProperty(Store.prototype, name, {
        get(this: Store<T>) {
          //console.log(this);

          return this.chunk()[name];
        },
      });
    }
    this.db.StoreConstructor = Store as any;
  }

  async connect(): Promise<DatabaseState> {
    return await this.orm.connect();
  }
  async transact(
    info: FinalTxInfo,
    cb: (store: Store<T>) => Promise<void>
  ): Promise<void> {
    //@ts-ignore
    await this.orm.transact(info, cb);
    //@ts-ignore
    await this.db.transact(info, cb);
  }
}

/* export type StoreTables<T extends Tables> = Readonly<{
  [k in keyof T]: ToStoreWriter<DataBuffer<T>[k]>;
}> & {
  forced: boolean;
}; */
type ToStoreWriter<W extends TableWriter<any>> = Pick<W, "write" | "writeMany">;
