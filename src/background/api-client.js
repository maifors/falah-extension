const FALAH_API = 'https://app-814845252352.us-central1.run.app';
const ISTORE_API = 'http://localhost:3000';

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
    return this._fetch(`${FALAH_API}/health`);
  }

  async login(email, password) {
    const data = await this._fetch(`${FALAH_API}/ummahid/api/auth/login`, {
      method: 'POST', body: JSON.stringify({ email, password })
    });
    if (data?.token) {
      this.token = data.token;
      this.user = data.user;
    }
    return data;
  }

  async getIdentity(id) {
    return this._fetch(`${FALAH_API}/ummahid/api/identity/${id}`);
  }

  async createWallet(userId) {
    return this._fetch(`${FALAH_API}/wallet/api/wallet/create`, {
      method: 'POST', body: JSON.stringify({ userId })
    });
  }

  async getWallet(id) {
    return this._fetch(`${FALAH_API}/wallet/api/wallet/${id}`);
  }

  async getWalletTransactions(id) {
    return this._fetch(`${FALAH_API}/wallet/api/wallet/${id}/transactions`);
  }

  async getFees() {
    return this._fetch(`${FALAH_API}/wallet/api/fees`);
  }

  async getWalletStats() {
    return this._fetch(`${FALAH_API}/wallet/api/stats`);
  }

  async getRamzTemplates() {
    return this._fetch(`${FALAH_API}/ramz/api/templates`);
  }

  async getRamzContracts(status) {
    const qs = status ? `?status=${status}` : '';
    return this._fetch(`${FALAH_API}/ramz/api/contracts${qs}`);
  }

  async getRamzStats() {
    return this._fetch(`${FALAH_API}/ramz/api/stats`);
  }

  async getNetworkStatus() {
    const results = {
      gateway: 'unknown', ummah: 'unknown', wallet: 'unknown', mocknet: 'unknown'
    };
    const gw = await this._fetch(`${FALAH_API}/health`);
    if (gw) results.gateway = 'online';
    const ummah = await this._fetch(`${FALAH_API}/ummahid/api/health`);
    if (ummah) results.ummah = 'online';
    const w = await this._fetch(`${FALAH_API}/wallet/api/stats`);
    if (w) results.wallet = 'online';
    const m = await this._fetch(`${FALAH_API}/mocknet/network`);
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
    return this._fetch(`${FALAH_API}/zakat/api/zakat/calculate`, {
      method: 'POST', body: JSON.stringify({ wealth, currency: 'MYR' })
    });
  }

  async payZakat(amount, walletId) {
    return this._fetch(`${FALAH_API}/zakat/api/zakat/pay`, {
      method: 'POST', body: JSON.stringify({ amount, walletId, currency: 'MYR' })
    });
  }

  async getZakatHistory(userId) {
    return this._fetch(`${FALAH_API}/zakat/api/zakat/history/${userId}`);
  }

  getMockCatalog() {
    return {
      categories: [
        { name: 'Finance', slug: 'finance', count: 12 },
        { name: 'Lifestyle', slug: 'lifestyle', count: 18 },
        { name: 'Spirituality', slug: 'spirituality', count: 8 },
        { name: 'Education', slug: 'education', count: 10 },
        { name: 'Productivity', slug: 'productivity', count: 15 },
        { name: 'Health', slug: 'health', count: 7 },
      ],
      apps: [
        { id: '1', name: 'Zakat Calculator', slug: 'zakat-calculator', price: 0, rating: 4.8, downloads: 5000, category: 'Finance', developer: 'Falah Labs', verified: true, icon: '💰', tagline: 'Calculate your Zakat accurately' },
        { id: '2', name: 'Qibla Compass', slug: 'qibla-compass', price: 0, rating: 4.9, downloads: 25000, category: 'Lifestyle', developer: 'Islamic Apps Co', verified: true, icon: '🧭', tagline: 'Find Qibla from anywhere' },
        { id: '3', name: 'Islamic Calendar', slug: 'islamic-calendar', price: 0, rating: 4.7, downloads: 15000, category: 'Productivity', developer: 'Muslim Devs', verified: true, icon: '📅', tagline: 'Hijri & Gregorian calendar' },
        { id: '4', name: 'Halal Food Scanner', slug: 'halal-food-scanner', price: 2.99, rating: 4.6, downloads: 8000, category: 'Lifestyle', developer: 'Halal Tech', verified: true, icon: '🥩', tagline: 'Scan barcodes for halal status' },
        { id: '5', name: 'Dhikr Counter', slug: 'dhikr-counter', price: 0, rating: 4.9, downloads: 30000, category: 'Spirituality', developer: 'Dawn Apps', verified: true, icon: '📿', tagline: 'Digital tasbih for daily dhikr' },
        { id: '6', name: 'Mosque Finder', slug: 'mosque-finder', price: 0, rating: 4.5, downloads: 12000, category: 'Lifestyle', developer: 'Local Maps', verified: false, icon: '🕌', tagline: 'Find nearby mosques' },
        { id: '7', name: 'Quran Study', slug: 'quran-study', price: 0, rating: 4.9, downloads: 45000, category: 'Education', developer: 'Falah Labs', verified: true, icon: '📖', tagline: 'Tafsir, translation & recitation' },
        { id: '8', name: 'Faraid Calculator', slug: 'faraid-calculator', price: 0, rating: 4.7, downloads: 3200, category: 'Finance', developer: 'Falah Labs', verified: true, icon: '⚖️', tagline: 'Islamic inheritance distribution' },
        { id: '9', name: 'Halal Travel Guide', slug: 'halal-travel', price: 1.99, rating: 4.4, downloads: 6700, category: 'Lifestyle', developer: 'Muslim Roam', verified: false, icon: '✈️', tagline: 'Halal restaurants & hotels worldwide' },
        { id: '10', name: 'Sadaqah Tracker', slug: 'sadaqah-tracker', price: 0, rating: 4.6, downloads: 8900, category: 'Spirituality', developer: 'CharityTech', verified: true, icon: '🤲', tagline: 'Track your charity and sadaqah' },
      ],
      flagships: [
        { id: 'f1', name: 'Faraid App', slug: 'faraid', tagline: 'Islamic inheritance made simple', icon: '⚖️', developer: 'Falah Labs' },
        { id: 'f2', name: 'Halal/JAKIM', slug: 'halal-jakim', tagline: 'Halal certification workflow', icon: '✅', developer: 'Falah Labs' },
        { id: 'f3', name: 'Shariah Compliance', slug: 'shariah-compliance', tagline: 'Smart contract compliance engine', icon: '📜', developer: 'Falah Labs' },
      ]
    };
  }

  getMockWallet() {
    return {
      id: 'wallet-' + Date.now().toString(36),
      address: '0x' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16)).join(''),
      balance: Math.floor(Math.random() * 50000) / 100,
      currency: 'FLH',
      created: new Date().toISOString()
    };
  }

  getMockTransactions() {
    const types = ['TRANSFER_IN', 'TRANSFER_OUT', 'MINT'];
    return Array.from({length: 10}, (_, i) => ({
      id: `tx-${Date.now().toString(36)}-${i}`,
      type: types[i % 3],
      amount: (Math.random() * 1000).toFixed(2),
      currency: 'FLH',
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      status: 'completed'
    }));
  }

  getMockWalletStats() {
    return {
      totalWallets: Math.floor(Math.random() * 500) + 100,
      totalTransactions: Math.floor(Math.random() * 5000) + 500,
      volume: (Math.random() * 100000).toFixed(2),
      feePercentage: 1.5
    };
  }

  calculateMockZakat(wealth) {
    const nisab = 20000;
    if (wealth < nisab) {
      return { amount: 0, nisab, message: 'Wealth is below nisab. No zakat due.', eligible: false };
    }
    return { amount: wealth * 0.025, nisab, rate: 2.5, message: 'Zakat calculated at 2.5% of total wealth.', eligible: true };
  }

  getDemoSession() {
    return {
      token: 'demo-token-' + Date.now().toString(36),
      user: {
        id: 'ummah-demo-001',
        email: 'demo@falah.os',
        name: 'Demo User',
        tier: 'explorer',
        avatar: '👤',
        joined: '2026-01-15T00:00:00Z',
        verified: true
      },
      wallet: {
        id: 'wallet-demo-001',
        address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
        label: 'Demo Wallet',
        balance: 1234.56,
        currency: 'FLH',
        created: '2026-01-15T00:00:00Z',
        network: 'falah-mainnet'
      },
      transactions: [
        { id: 'tx-demo-01', type: 'MINT', amount: '1000.00', currency: 'FLH', timestamp: '2026-01-15T08:00:00Z', status: 'completed', memo: 'Genesis mint' },
        { id: 'tx-demo-02', type: 'TRANSFER_IN', amount: '250.00', currency: 'FLH', timestamp: '2026-01-20T14:30:00Z', status: 'completed', memo: 'From Ummah ID rewards' },
        { id: 'tx-demo-03', type: 'TRANSFER_OUT', amount: '15.50', currency: 'FLH', timestamp: '2026-02-01T09:15:00Z', status: 'completed', memo: 'Zakat contribution' },
        { id: 'tx-demo-04', type: 'TRANSFER_IN', amount: '50.00', currency: 'FLH', timestamp: '2026-02-10T11:00:00Z', status: 'completed', memo: 'iStore purchase refund' },
        { id: 'tx-demo-05', type: 'TRANSFER_OUT', amount: '100.00', currency: 'FLH', timestamp: '2026-03-05T16:45:00Z', status: 'completed', memo: 'Sadaqah donation' },
        { id: 'tx-demo-06', type: 'MINT', amount: '50.00', currency: 'FLH', timestamp: '2026-03-15T08:00:00Z', status: 'completed', memo: 'Staking reward' },
      ],
      zakatHistory: [
        { id: 'zk-demo-01', amount: 15.50, currency: 'MYR', timestamp: '2026-02-01T09:15:00Z', status: 'completed', type: 'maal' },
        { id: 'zk-demo-02', amount: 200.00, currency: 'MYR', timestamp: '2026-03-01T10:00:00Z', status: 'completed', type: 'maal' },
      ],
      contracts: [
        { id: 'ct-demo-01', title: 'HalalCert Application #JAKIM-2026-0421', status: 'active', type: 'certification', created: '2026-02-20T00:00:00Z' },
        { id: 'ct-demo-02', title: 'Faraid Distribution — Estate #F-2026-011', status: 'pending', type: 'faraid', created: '2026-03-10T00:00:00Z' },
      ]
    };
  }
}
