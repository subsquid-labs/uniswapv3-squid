import { Store, Table, TableWriter } from "@subsquid/file-store";
import { Store as OrmStore } from "@subsquid/typeorm-store";
import { ChangeTracker } from "@subsquid/typeorm-store/lib/hot";
import { EntityManager } from "typeorm";
type Tables = Record<string, Table<any>>;

export type DataBuffer<T extends Tables> = {
  [k in keyof T]: TableWriter<T[k] extends Table<infer R> ? R : never>;
};

export class DoubleStore<T extends Tables> {
  filestore: Store<T>;
  typeormstore: OrmStore;
  constructor(
    private em: () => EntityManager,
    protected chunk: () => DataBuffer<T>,
    private changes?: ChangeTracker
  ) {
    this.typeormstore = new OrmStore(em);
    this.filestore = {} as Store<T>;
  }
}
