import { IsolationLevel } from "@subsquid/typeorm-store";
import { createOrmConfig } from "@subsquid/typeorm-config";
import {
  DatabaseState,
  FinalTxInfo,
  HashAndHeight,
} from "@subsquid/typeorm-store/lib/interfaces";
import { Store } from "./customStore";
import { DataSource, EntityManager } from "typeorm";
import { Table, Dest, TableWriter, DatabaseHooks } from "@subsquid/file-store";
import assert from "assert";
import { assertNotNull } from "@subsquid/evm-processor";
import { ChangeTracker, rollbackBlock } from "@subsquid/typeorm-store/lib/hot";
import { S3Dest } from "@subsquid/file-store-s3";
export type Database<S> = FinalDatabase<S>;
export interface FinalDatabase<S> {
  supportsHotBlocks?: false;
  connect(): Promise<HashAndHeight>;
  transact(info: FinalTxInfo, cb: (store: S) => Promise<void>): Promise<void>;
}
export type Tables = Record<string, Table<any>>;
export type DataBuffer<T extends Tables> = {
  [k in keyof T]: TableWriter<T[k] extends Table<infer R> ? R : never>;
};
//implement db with store.
interface StoreConstructor<T extends Tables> {
  new (chunk: () => DataBuffer<T>): Store<T>;
}
export interface DatabaseOptions<T extends Tables, D extends S3Dest> {
  tables: T;
  dest: D;
  chunkSizeMb?: number;
  syncIntervalBlocks?: number;
  hooks?: DatabaseHooks<D>;
}

export class CustomDatabase<T extends Tables, D extends S3Dest>
  implements FinalDatabase<Store<T>>
{
  //from orm
  private statusSchema: string;
  private isolationLevel: IsolationLevel;
  private con?: DataSource;
  private projectDir: string;

  //from final
  private tables: T;
  private dest: D;
  private chunkSize: number;
  private updateInterval: number;
  private hooks: DatabaseHooks<D>;

  private StoreConstructor: StoreConstructor<T>;

  private chunk?: DataBuffer<T>;
  private state?: HashAndHeight;
  constructor(options: DatabaseOptions<T, D>) {
    //orm
    this.statusSchema = "squid_processor";
    this.isolationLevel = "SERIALIZABLE";
    this.projectDir = process.cwd();
    //filestore
    this.tables = options.tables;
    this.dest = options.dest;

    this.chunkSize = options?.chunkSizeMb ?? 20;
    this.updateInterval = options?.syncIntervalBlocks || Infinity;
    this.hooks = options.hooks || defaultHooks;

    for (let name in this.tables) {
      Object.defineProperty(Store.prototype, name, {
        get(this: Store<T>) {
          this.data[name] = this.chunk()[name];
          let q = this.chunk()[name];
          return this.chunk()[name];
        },
      });
    }
    this.StoreConstructor = Store<T> as any;
  }

  async connect(): Promise<DatabaseState> {
    assert(this.con == null, "already connected");
    this.state = await this.getTableState();
    let names = await this.dest.readdir("./");
    for (let name of names) {
      let chunkStart = Number(name.split("-")[0]);
      if (chunkStart > this.state.height) {
        await this.dest.rm(name);
      }
    }
    let cfg = createOrmConfig({ projectDir: this.projectDir });
    this.con = new DataSource(cfg);

    await this.con.initialize();

    try {
      return await this.con.transaction("SERIALIZABLE", (em) =>
        this.initTransaction(em)
      );
    } catch (e: any) {
      await this.con.destroy().catch(() => {}); // ignore error
      this.con = undefined;
      throw e;
    }
  }
  async disconnect(): Promise<void> {
    await this.con?.destroy().finally(() => (this.con = undefined));
  }

  private async initTransaction(em: EntityManager): Promise<DatabaseState> {
    let schema = this.escapedSchema();

    await em.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await em.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.status (` +
        `id int4 primary key, ` +
        `height int4 not null, ` +
        `hash text DEFAULT '0x', ` +
        `nonce int4 DEFAULT 0` +
        `)`
    );
    await em.query(
      // for databases created by prev version of typeorm store
      `ALTER TABLE ${schema}.status ADD COLUMN IF NOT EXISTS hash text DEFAULT '0x'`
    );
    await em.query(
      // for databases created by prev version of typeorm store
      `ALTER TABLE ${schema}.status ADD COLUMN IF NOT EXISTS nonce int DEFAULT 0`
    );
    await em.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.hot_block (height int4 primary key, hash text not null)`
    );
    await em.query(
      `CREATE TABLE IF NOT EXISTS ${schema}.hot_change_log (` +
        `block_height int4 not null references ${schema}.hot_block on delete cascade, ` +
        `index int4 not null, ` +
        `change jsonb not null, ` +
        `PRIMARY KEY (block_height, index)` +
        `)`
    );

    let status: (HashAndHeight & { nonce: number })[] = await em.query(
      `SELECT height, hash, nonce FROM ${schema}.status WHERE id = 0`
    );
    if (status.length == 0) {
      await em.query(
        `INSERT INTO ${schema}.status (id, height, hash) VALUES (0, -1, '0x')`
      );
      status.push({ height: -1, hash: "0x", nonce: 0 });
    }

    let top: HashAndHeight[] = await em.query(
      `SELECT height, hash FROM ${schema}.hot_block ORDER BY height`
    );

    return assertStateInvariants({ ...status[0], top });
  }
  private async getState(em: EntityManager): Promise<DatabaseState> {
    let schema = this.escapedSchema();

    let status: (HashAndHeight & { nonce: number })[] = await em.query(
      `SELECT height, hash, nonce FROM ${schema}.status WHERE id = 0`
    );

    assert(status.length == 1);

    let top: HashAndHeight[] = await em.query(
      `SELECT hash, height FROM ${schema}.hot_block ORDER BY height`
    );

    return assertStateInvariants({ ...status[0], top });
  }

  private createChunk(): DataBuffer<T> {
    let chunk = {} as DataBuffer<T>;
    for (let name in this.tables) {
      chunk[name] = this.tables[name].createWriter();
    }
    return chunk;
  }

  async transact(
    info: FinalTxInfo,
    cb: (store: Store<T>) => Promise<void>
  ): Promise<void> {
    let dbState = await this.getTableState();
    let prevState = assertNotNull(this.state, "not connected");
    let { nextHead: newState } = info;

    assert(
      dbState.hash === prevState.hash && dbState.height === prevState.height,
      "state was updated by foreign process, make sure no other processor is running"
    );
    assert(prevState.height < newState.height);
    assert(prevState.hash != newState.hash);

    this.chunk = this.chunk || this.createChunk();
    await this.performTableUpdates(cb, this.chunk);
    let chunkSize = 0;
    for (let name in this.chunk) {
      chunkSize += this.chunk[name].size;
    }

    if (
      chunkSize >= this.chunkSize * 1024 * 1024 || //info.isOnTop &&
      newState.height - prevState.height >= this.updateInterval
    ) {
      if (chunkSize > 0) {
        await this.flush(prevState, newState, this.chunk);
      }
      await this.hooks.onStateUpdate(this.dest, newState);
      this.state = newState;
    }
    //ORM
    return this.submit(async (em) => {
      let state = await this.getState(em);
      let { prevHead: prev, nextHead: next } = info;

      assert(state.hash === info.prevHead.hash, RACE_MSG);
      assert(state.height === prev.height);
      assert(prev.height < next.height);
      assert(prev.hash != next.hash);

      for (let i = state.top.length - 1; i >= 0; i--) {
        let block = state.top[i];
        await rollbackBlock(this.statusSchema, em, block.height);
      }

      await this.performUpdates(cb, em);

      await this.updateStatus(em, state.nonce, next);
    });
  }

  private async flush(
    prevState: HashAndHeight,
    newState: HashAndHeight,
    chunk: DataBuffer<T>
  ) {
    let folderName = createFolderName(prevState.height + 1, newState.height);
    await this.dest.transact(folderName, async (txDest) => {
      for (let tableAlias in this.tables) {
        await txDest.writeFile(
          `${this.tables[tableAlias].name}`,
          chunk[tableAlias].flush()
        );
      }
    });
  }
  private deleteHotBlocks(
    em: EntityManager,
    finalizedHeight: number
  ): Promise<void> {
    return em.query(
      `DELETE FROM ${this.escapedSchema()}.hot_block WHERE height <= $1`,
      [finalizedHeight]
    );
  }

  private insertHotBlock(
    em: EntityManager,
    block: HashAndHeight
  ): Promise<void> {
    return em.query(
      `INSERT INTO ${this.escapedSchema()}.hot_block (height, hash) VALUES ($1, $2)`,
      [block.height, block.hash]
    );
  }
  private async performTableUpdates(
    cb: (store: Store<T>) => Promise<void>,
    chunk: DataBuffer<T>
  ): Promise<void> {
    let running = true;
    let store = new this.StoreConstructor(() => {
      assert(running, `too late to perform updates`);
      return chunk;
    });

    try {
      await cb(store);
    } finally {
      running = false;
    }
  }

  private async getTableState(): Promise<HashAndHeight> {
    let state = await this.hooks.onStateRead(this.dest);
    if (state == null) {
      state = { height: -1, hash: "0x" };
      await this.hooks.onStateUpdate(this.dest, state);
    }
    assert(Number.isSafeInteger(state.height));
    return state;
  }

  private async updateStatus(
    em: EntityManager,
    nonce: number,
    next: HashAndHeight
  ): Promise<void> {
    let schema = this.escapedSchema();

    let result: [data: any[], rowsChanged: number] = await em.query(
      `UPDATE ${schema}.status SET height = $1, hash = $2, nonce = nonce + 1 WHERE id = 0 AND nonce = $3`,
      [next.height, next.hash, nonce]
    );

    let rowsChanged = result[1];

    // Will never happen if isolation level is SERIALIZABLE or REPEATABLE_READ,
    // but occasionally people use multiprocessor setups and READ_COMMITTED.
    assert.strictEqual(rowsChanged, 1, RACE_MSG);
  }

  private async performUpdates(
    cb: (store: Store<T>) => Promise<void>,
    em: EntityManager,
    changeTracker?: ChangeTracker
  ): Promise<void> {
    let running = true;

    let store = new Store<T>(() => {
      assert(
        running,
        `too late to perform db updates, make sure you haven't forgot to await on db query`
      );
      return em;
      //@ts-ignore
    }, changeTracker);

    try {
      await cb(store);
    } finally {
      running = false;
    }
  }

  private async submit(
    tx: (em: EntityManager) => Promise<void>
  ): Promise<void> {
    let retries = 3;
    while (true) {
      try {
        let con = this.con;
        assert(con != null, "not connected");
        return await con.transaction(this.isolationLevel, tx);
      } catch (e: any) {
        if (e.code == "40001" && retries) {
          retries -= 1;
        } else {
          throw e;
        }
      }
    }
  }

  private escapedSchema(): string {
    let con = assertNotNull(this.con);
    return con.driver.escape(this.statusSchema);
  }
}

const DEFAULT_STATUS_FILE = `status.txt`;
const defaultHooks: DatabaseHooks = {
  async onStateRead(dest) {
    if (await dest.exists(DEFAULT_STATUS_FILE)) {
      let [height, hash] = await dest
        .readFile(DEFAULT_STATUS_FILE)
        .then((d) => d.split("\n"));
      return { height: Number(height), hash: hash || "0x" };
    } else {
      return undefined;
    }
  },
  async onStateUpdate(dest, info) {
    await dest.writeFile(DEFAULT_STATUS_FILE, info.height + "\n" + info.hash);
  },
};
const RACE_MSG =
  "status table was updated by foreign process, make sure no other processor is running";
function assertStateInvariants(state: DatabaseState): DatabaseState {
  let height = state.height;

  // Sanity check. Who knows what driver will return?
  assert(Number.isSafeInteger(height));

  assertChainContinuity(state, state.top);

  return state;
}

function assertChainContinuity(base: HashAndHeight, chain: HashAndHeight[]) {
  let prev = base;
  for (let b of chain) {
    assert(b.height === prev.height + 1, "blocks must form a continues chain");
    prev = b;
  }
}
export function createFolderName(from: number, to: number) {
  let name =
    from.toString().padStart(10, "0") + "-" + to.toString().padStart(10, "0");
  assert(isFolderName(name));
  return name;
}

export function isFolderName(str: string) {
  return /^(\d+)-(\d+)$/.test(str);
}
