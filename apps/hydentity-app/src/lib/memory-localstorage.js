/**
 * In-memory mock of node-localstorage for Vercel deployment.
 *
 * The privacycash SDK uses node-localstorage which tries to write to disk.
 * On Vercel, the filesystem is read-only. This mock stores data in memory
 * instead, which is fine since:
 * 1. The cache is only for convenience (persisting derived keys)
 * 2. Our frontend handles re-initialization via browser localStorage
 * 3. Each serverless invocation is independent anyway
 */

class LocalStorage {
  constructor(_location) {
    this._data = new Map();
    this.length = 0;
  }

  getItem(key) {
    const value = this._data.get(key);
    return value !== undefined ? value : null;
  }

  setItem(key, value) {
    if (!this._data.has(key)) {
      this.length++;
    }
    this._data.set(key, String(value));
  }

  removeItem(key) {
    if (this._data.has(key)) {
      this._data.delete(key);
      this.length--;
    }
  }

  key(index) {
    const keys = Array.from(this._data.keys());
    return keys[index] !== undefined ? keys[index] : null;
  }

  clear() {
    this._data.clear();
    this.length = 0;
  }

  keys() {
    return Array.from(this._data.keys());
  }
}

class JSONStorage extends LocalStorage {
  getItem(key) {
    const value = super.getItem(key);
    if (value === null) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  setItem(key, value) {
    super.setItem(key, JSON.stringify(value));
  }
}

module.exports = { LocalStorage, JSONStorage };
