type Listener = (...args: any[]) => void;
type Subscription = { remove: () => void };

/** The instance surface. Declared because the returned class has a private member, which
 *  an anonymous class's inferred type cannot carry into declaration output (TS4094). */
interface NativeEventEmitterMock {
  addListener(event: string, handler: Listener): Subscription;
  removeAllListeners(event?: string): void;
  emit(event: string, ...args: any[]): void;
  listenerCount(event: string): number;
}

export function createNativeEventEmitterMock(): new (...args: any[]) => NativeEventEmitterMock {
  return class NativeEventEmitter {
    private listeners: Map<string, Set<Listener>> = new Map();

    addListener(event: string, handler: Listener): Subscription {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(handler);

      return {
        remove: () => {
          this.listeners.get(event)?.delete(handler);
        },
      };
    }

    removeAllListeners(event?: string): void {
      if (event) {
        this.listeners.delete(event);
      } else {
        this.listeners.clear();
      }
    }

    emit(event: string, ...args: any[]): void {
      this.listeners.get(event)?.forEach((handler) => handler(...args));
    }

    listenerCount(event: string): number {
      return this.listeners.get(event)?.size ?? 0;
    }
  };
}
