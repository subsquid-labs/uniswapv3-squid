import { DatabaseOptions, Table } from "@subsquid/file-store";
import { Database } from "./publicFilestore";
import { Dest } from "@subsquid/file-store/src/dest";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { DatabaseState } from "@subsquid/typeorm-store/lib/interfaces";

import {
  FinalDatabase,
  FinalTxInfo,
  HashAndHeight,
} from "@subsquid/util-internal-processor-tools";
import { Store } from "@subsquid/file-store";
import { Store as OrmStore } from "@subsquid/typeorm-store";
type Tables = Record<string, Table<any>>;
type S = any;
type T = any;
type D = any;
import { DataBuffer, DoubleStore } from "./doubleStore";
import { EntityManager } from "typeorm";
export class DoubleDB implements FinalDatabase<S> {
  orm: TypeormDatabase;
  db: Database<Tables, Dest>;

  supportsHotBlocks?: false | undefined;
  constructor(dbOptions: DatabaseOptions<T, D>) {
    this.orm = new TypeormDatabase();
    this.db = new Database(dbOptions);
  }
  async connect(): Promise<DatabaseState> {
    await this.db.connect();
    return await this.orm.connect();
  }
  async transactOrm(
    info: FinalTxInfo,
    cb: (store: OrmStore) => Promise<void>
  ): Promise<void> {
    await this.orm.transact(info, cb);
  }

  async transactDb(
    info: FinalTxInfo,
    cb: (store: Store<T>) => Promise<void>
  ): Promise<void> {
    await this.db.transact(info, cb);
  }

  async transact(
    info: FinalTxInfo,
    cb: (store: DoubleStore<T>) => Promise<void>
  ): Promise<void> {
    await this.db.transact(info, cb);
    await this.orm.transact(info, cb);
  }
}
