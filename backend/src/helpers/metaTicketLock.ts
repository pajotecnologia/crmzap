import { Mutex } from "async-mutex";

const ticketLocks = new Map<string, Mutex>();

/** Mutex compartilhado por chave (evita 2 tickets no mesmo contato/conexão sob race do webhook Meta). */
export const runWithTicketLock = async <T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> => {
  let mutex = ticketLocks.get(key);
  if (!mutex) {
    mutex = new Mutex();
    ticketLocks.set(key, mutex);
  }
  try {
    return await mutex.runExclusive(fn);
  } finally {
    if (!mutex.isLocked()) {
      ticketLocks.delete(key);
    }
  }
};
