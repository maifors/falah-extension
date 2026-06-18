const FALAH_API = 'https://falah-os.com';
const ISTORE_API = 'http://localhost:3000';

import {
  getMockCatalog,
  getMockWallet,
  getMockTransactions,
  getMockWalletStats,
  calculateMockZakat,
  getDemoSession
} from './mock-data.js';

export class FalahApiClient {
  constructor() {
    this.token = null;
    this.user = null;
  }

  setToken(token) {
    this.token = token;
  }

  headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  async _fetch(url, options = {}) {
    try {
      const resp = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn(`[Falah API] ${url} failed:`, err.message);
      return null;
    }
  }

  async health() {
    return this._fetch(`${FALAH_API}/api/health`);
  }

  async login(email, password) {
    const data = await this._fetch(`${FALAH_API}/api/ummahid/auth/login`, {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    if (data?.token) {
      this.token = data.token;
      this.user = data.user;
    }
    return data;
  }

  async getIdentity(id) {
    return this._fetch(`${FALAH_API}/api/ummahid/identity/${id}`);
  }

  async createWallet(userId) {
    return this._fetch(`${FALAH_API}/api/wallet/create`, {
      method: 'POST', body: JSON.stringify({ userId })
    });
  }

  async getWallet(id) {
    return this._fetch(`${FALAH_API}/api/wallet/${id}`);
  }

  async getWalletTransactions(id) {
    return this._fetch(`${FALAH_API}/api/wallet/${id}/transactions`);
  }

  async getFees() {
    return this._fetch(`${FALAH_API}/api/fees`);
  }

  async getWalletStats() {
    return this._fetch(`${FALAH_API}/api/wallet/stats`);
  }

  async getRamzTemplates() {
    return this._fetch(`${FALAH_API}/api/ramz/templates`);
  }

  async getRamzContracts(status) {
    const qs = status ? `?status=${status}` : '';
    return this._fetch(`${FALAH_API}/api/ramz/contracts${qs}`);
  }

  async getRamzStats() {
    return this._fetch(`${FALAH_API}/api/ramz/stats`);
  }

  async getNetworkStatus() {
    const results = {
      gateway: 'unknown', ummah: 'unknown', wallet: 'unknown', mocknet: 'unknown'
    };
    const gw = await this._fetch(`${FALAH_API}/api/health`);
    if (gw) results.gateway = 'online';
    const ummah = await this._fetch(`${FALAH_API}/api/ummahid/stats`);
    if (ummah) results.ummah = 'online';
    const w = await this._fetch(`${FALAH_API}/api/wallet/stats`);
    if (w) results.wallet = 'online';
    const m = await this._fetch(`${FALAH_API}/api/mocknet/network`);
    if (m) results.mocknet = 'online';
    return results;
  }

  async getCatalog() {
    try {
      const resp = await fetch(`${ISTORE_API}/api/apps`, {
        signal: AbortSignal.timeout(5000)
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.apps) return data;
      }
    } catch (_) {}
    return null;
  }

  async calculateZakat(wealth) {
    return this._fetch(`${FALAH_API}/api/zakat/calculate`, {
      method: 'POST', body: JSON.stringify({ wealth, currency: 'MYR' })
    });
  }

  async payZakat(amount, walletId) {
    return this._fetch(`${FALAH_API}/api/zakat/pay`, {
      method: 'POST', body: JSON.stringify({ amount, walletId, currency: 'MYR' })
    });
  }

  async getZakatHistory(userId) {
    return this._fetch(`${FALAH_API}/api/zakat/history/${userId}`);
  }

  getMockCatalog() {
    return getMockCatalog();
  }

  getMockWallet() {
    return getMockWallet();
  }

  getMockTransactions() {
    return getMockTransactions();
  }

  getMockWalletStats() {
    return getMockWalletStats();
  }

  calculateMockZakat(wealth) {
    return calculateMockZakat(wealth);
  }

  getDemoSession() {
    return getDemoSession();
  }
}
