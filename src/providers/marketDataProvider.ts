import { MarketQuote, MarketDataProviderState, ProviderMode, ProviderStatus } from './types';
import { AngelMarketDataAdapter, angelMarketDataAdapter } from '../utils/angelMarketDataAdapter';

export abstract class BaseMarketDataProvider {
  protected mode: ProviderMode = 'SIMULATED_REPLAY';
  protected status: ProviderStatus = 'STANDBY';
  protected quotes: Record<string, MarketQuote> = {};
  protected listeners: Array<(quote: MarketQuote) => void> = [];
  protected lastUpdate: number = Date.now();
  protected failureReason: string | undefined = undefined;

  public abstract start(): void;
  public abstract stop(): void;

  public getMode(): ProviderMode {
    return this.mode;
  }

  public getStatus(): ProviderStatus {
    return this.status;
  }

  public getQuote(symbol: string): MarketQuote | undefined {
    return this.quotes[symbol];
  }

  public getQuotes(): Record<string, MarketQuote> {
    return { ...this.quotes };
  }

  public onTick(listener: (quote: MarketQuote) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  protected dispatch(quote: MarketQuote): void {
    this.quotes[quote.symbol] = quote;
    this.lastUpdate = Date.now();
    this.listeners.forEach((fn) => {
      try {
        fn(quote);
      } catch (e) {}
    });
  }

  public getState(): MarketDataProviderState {
    const ageMs = Date.now() - this.lastUpdate;
    const isFresh = ageMs <= 120000; // 2 minutes freshness threshold
    const canTrade = this.status === 'CONNECTED' && isFresh && Object.keys(this.quotes).length > 0;

    return {
      mode: this.mode,
      status: this.status,
      isLiveConnected: this.mode === 'LIVE_MARKET_DATA_PAPER' && this.status === 'CONNECTED',
      feedSource: this.mode === 'MOCK_TEST' ? 'DETERMINISTIC_MOCK_FEED' : (this.quotes['NIFTY 50']?.source || this.mode),
      lastUpdate: this.lastUpdate,
      reason: this.failureReason || (isFresh ? undefined : `Market feed stale: last tick received ${Math.round(ageMs / 1000)}s ago`),
      isDataFresh: isFresh,
      canTrade,
      quotesCount: Object.keys(this.quotes).length,
      maskedClient: 'UNCONFIGURED'
    };
  }
}

// ----------------------------------------------------------------------------
// 1. SIMULATED REPLAY PROVIDER
// ----------------------------------------------------------------------------
export class SimulatedReplayProvider extends BaseMarketDataProvider {
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.mode = 'SIMULATED_REPLAY';
    this.status = 'CONNECTED';
    this.quotes = {
      'NIFTY 50': { symbol: 'NIFTY 50', token: '26000', price: 25840.50, change: 142.30, pct: 0.55, volume: '14.2M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'BANKNIFTY': { symbol: 'BANKNIFTY', token: '26009', price: 54120.00, change: -88.40, pct: -0.16, volume: '8.7M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'FINNIFTY': { symbol: 'FINNIFTY', token: '26037', price: 24210.00, change: 64.20, pct: 0.27, volume: '3.1M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'GOLD MCX': { symbol: 'GOLD MCX', token: '234567', price: 78450.00, change: 320.00, pct: 0.41, volume: '4.2K', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'RELIANCE': { symbol: 'RELIANCE', token: '2885', price: 2980.00, change: 18.75, pct: 0.63, volume: '4.8M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'HDFCBANK': { symbol: 'HDFCBANK', token: '1333', price: 1685.00, change: -6.40, pct: -0.38, volume: '6.2M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' },
      'INFY': { symbol: 'INFY', token: '1594', price: 1890.00, change: 24.10, pct: 1.29, volume: '2.9M', timestamp: Date.now(), source: 'SIMULATED_REPLAY' }
    };
  }

  public start(): void {
    if (this.interval) return;
    this.status = 'CONNECTED';
    this.interval = setInterval(() => {
      Object.keys(this.quotes).forEach((sym) => {
        const q = this.quotes[sym];
        const scale = sym.includes('BANK') ? 6.0 : sym.includes('GOLD') ? 8.0 : sym.includes('NIFTY') ? 2.5 : 1.2;
        const delta = (Math.random() - 0.49) * scale;
        const newPrice = Number((q.price + delta).toFixed(2));
        const newChange = Number((q.change + delta).toFixed(2));
        const newPct = Number(((newChange / (newPrice - newChange)) * 100).toFixed(2));

        this.dispatch({
          symbol: sym,
          token: q.token,
          price: newPrice,
          change: newChange,
          pct: newPct,
          volume: q.volume,
          timestamp: Date.now(),
          source: 'SIMULATED_REPLAY'
        });
      });
    }, 1500);
  }

  public stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.status = 'STANDBY';
  }
}

// ----------------------------------------------------------------------------
// 2. HISTORICAL REPLAY DATA PROVIDER
// ----------------------------------------------------------------------------
export class HistoricalReplayProvider extends BaseMarketDataProvider {
  private stepIndex = 0;
  private readonly historicalTicks: MarketQuote[] = [
    { symbol: 'NIFTY 50', token: '26000', price: 25800.00, change: 0.00, pct: 0.00, volume: '10.0M', timestamp: 1718000000000, source: 'HISTORICAL_REPLAY' },
    { symbol: 'NIFTY 50', token: '26000', price: 25825.50, change: 25.50, pct: 0.10, volume: '10.5M', timestamp: 1718000060000, source: 'HISTORICAL_REPLAY' },
    { symbol: 'NIFTY 50', token: '26000', price: 25860.00, change: 60.00, pct: 0.23, volume: '11.2M', timestamp: 1718000120000, source: 'HISTORICAL_REPLAY' },
    { symbol: 'BANKNIFTY', token: '26009', price: 54100.00, change: 0.00, pct: 0.00, volume: '5.0M', timestamp: 1718000000000, source: 'HISTORICAL_REPLAY' },
    { symbol: 'BANKNIFTY', token: '26009', price: 54180.00, change: 80.00, pct: 0.15, volume: '5.4M', timestamp: 1718000060000, source: 'HISTORICAL_REPLAY' }
  ];

  constructor() {
    super();
    this.mode = 'HISTORICAL_REPLAY';
    this.status = 'STANDBY';
  }

  public start(): void {
    this.status = 'CONNECTED';
    this.stepIndex = 0;
    this.playbackNext();
  }

  public playbackNext(): MarketQuote | null {
    if (this.stepIndex >= this.historicalTicks.length) {
      this.status = 'STANDBY';
      return null;
    }
    const tick = { ...this.historicalTicks[this.stepIndex], timestamp: Date.now() };
    this.stepIndex += 1;
    this.dispatch(tick);
    return tick;
  }

  public stop(): void {
    this.status = 'STANDBY';
  }
}

// ----------------------------------------------------------------------------
// 3. AUTHENTICATED LIVE BROKER ADAPTER (ANGEL ONE SMARTAPI)
// ----------------------------------------------------------------------------
export class LiveAngelMarketDataProvider extends BaseMarketDataProvider {
  private adapter: AngelMarketDataAdapter;

  constructor(customAdapter?: AngelMarketDataAdapter) {
    super();
    this.adapter = customAdapter || angelMarketDataAdapter;
    this.mode = 'LIVE_MARKET_DATA_PAPER';
    this.status = 'STANDBY';
  }

  public async start(): Promise<void> {
    const status = this.adapter.getStatus();
    if (!status.hasCredentials) {
      // Mark as DEGRADED / STANDBY honestly — never claim live when unconfigured!
      this.status = 'DEGRADED';
      this.failureReason = 'Angel One credentials unconfigured (ANGEL_API_KEY, ANGEL_CLIENT_ID missing). Running fail-closed standby.';
      this.quotes = this.adapter.getQuotes();
      return;
    }

    this.adapter.onTick((quote) => {
      this.dispatch(quote);
    });

    try {
      await this.adapter.connectSmartStream();
      const newStatus = this.adapter.getStatus();
      if (newStatus.isLiveStreaming) {
        this.status = 'CONNECTED';
        this.failureReason = undefined;
      } else if (newStatus.isLiveConnected) {
        this.status = 'STANDBY';
        this.failureReason = 'SmartStream connected. Awaiting initial live market tick.';
      } else {
        this.status = 'DEGRADED';
        this.failureReason = 'SmartStream WebSocket disconnected. Fallback standby active.';
      }
      this.quotes = this.adapter.getQuotes();
    } catch (err: any) {
      this.status = 'DISCONNECTED';
      this.failureReason = `Live connection error: ${err.message}`;
    }
  }

  public stop(): void {
    this.adapter.stop();
    this.status = 'STANDBY';
  }

  public override getState(): MarketDataProviderState {
    const baseState = super.getState();
    const adapterStatus = this.adapter.getStatus();
    const isStreaming = Boolean(adapterStatus.isLiveStreaming);

    const effectiveStatus = !adapterStatus.hasCredentials
      ? 'DEGRADED'
      : (isStreaming ? 'CONNECTED' : (adapterStatus.isLiveConnected ? 'STANDBY' : 'DEGRADED'));

    const canTrade = isStreaming;

    return {
      ...baseState,
      status: effectiveStatus,
      isLiveConnected: isStreaming,
      isLiveStreaming: isStreaming,
      feedSource: isStreaming ? 'OFFICIAL_ANGEL_ONE_SMARTSTREAM' : 'AUTHENTIC_PAPER_REPLAY',
      maskedClient: adapterStatus.clientMasked,
      quotesCount: adapterStatus.quotesCount,
      liveTicksCount: adapterStatus.liveTicksCount,
      dataAgeStatus: isStreaming ? 'FRESH' : 'SIMULATED',
      canTrade,
      reason: isStreaming
        ? undefined
        : (!adapterStatus.hasCredentials
            ? 'Angel One credentials unconfigured (ANGEL_API_KEY, ANGEL_CLIENT_ID missing). Running fail-closed standby.'
            : (adapterStatus.isLiveConnected
                ? 'SmartStream connected. Awaiting validated fresh market ticks.'
                : (this.failureReason || 'SmartStream disconnected. Fallback standby active.')))
    };
  }
}

// ----------------------------------------------------------------------------
// 4. MOCK API MARKET DATA PROVIDER (DETERMINISTIC TEST SUITE)
// ----------------------------------------------------------------------------
export class MockMarketDataProvider extends BaseMarketDataProvider {
  constructor() {
    super();
    this.mode = 'MOCK_TEST';
    this.status = 'CONNECTED';
    this.quotes = {
      'NIFTY 50': { symbol: 'NIFTY 50', token: '26000', price: 25000.00, change: 0, pct: 0, volume: '10M', timestamp: Date.now(), source: 'MOCK_TEST' }
    };
  }

  public start(): void {
    this.status = 'CONNECTED';
    this.failureReason = undefined;
  }

  public stop(): void {
    this.status = 'STANDBY';
  }

  public injectQuote(symbol: string, price: number, timestamp: number = Date.now()): void {
    const quote: MarketQuote = {
      symbol,
      token: 'mock_token',
      price,
      change: 0,
      pct: 0,
      volume: '1M',
      timestamp,
      source: 'MOCK_TEST'
    };
    this.dispatch(quote);
  }

  public simulateDisconnect(reason = 'Simulated Network Failure ECONNRESET'): void {
    this.status = 'DISCONNECTED';
    this.failureReason = reason;
  }

  public simulateStaleData(secondsAgo = 300): void {
    this.lastUpdate = Date.now() - secondsAgo * 1000;
    if (this.quotes['NIFTY 50']) {
      this.quotes['NIFTY 50'].timestamp = this.lastUpdate;
    }
  }
}

