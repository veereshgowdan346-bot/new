import {
  ProviderMode,
  ProviderDiagnostics,
  MarketQuote
} from './types';
import {
  BaseMarketDataProvider,
  SimulatedReplayProvider,
  HistoricalReplayProvider,
  LiveAngelMarketDataProvider,
  MockMarketDataProvider
} from './marketDataProvider';
import {
  GoogleOAuthProvider,
  TelegramBotProvider
} from './personalIntegrationsProvider';

export class ProviderManager {
  private activeMode: ProviderMode = 'SIMULATED_REPLAY';
  private simulatedReplay: SimulatedReplayProvider;
  private historicalReplay: HistoricalReplayProvider;
  private liveAngel: LiveAngelMarketDataProvider;
  private mockProvider: MockMarketDataProvider;

  public google: GoogleOAuthProvider;
  public telegram: TelegramBotProvider;

  private activeDataProvider: BaseMarketDataProvider;
  private unsubscribeTick: (() => void) | null = null;
  private externalListeners: Array<(quote: MarketQuote) => void> = [];

  constructor() {
    this.simulatedReplay = new SimulatedReplayProvider();
    this.historicalReplay = new HistoricalReplayProvider();
    this.liveAngel = new LiveAngelMarketDataProvider();
    this.mockProvider = new MockMarketDataProvider();

    this.google = new GoogleOAuthProvider();
    this.telegram = new TelegramBotProvider();

    // Default to SIMULATED_REPLAY
    this.activeDataProvider = this.simulatedReplay;
    this.wireDataProvider(this.activeDataProvider);
    this.activeDataProvider.start();
  }

  private wireDataProvider(provider: BaseMarketDataProvider): void {
    if (this.unsubscribeTick) {
      this.unsubscribeTick();
    }
    this.unsubscribeTick = provider.onTick((quote) => {
      this.externalListeners.forEach((fn) => {
        try {
          fn(quote);
        } catch (e) {}
      });
    });
  }

  public setMode(mode: ProviderMode): { success: boolean; activeMode: ProviderMode; message: string } {
    if (this.activeMode === mode) {
      return { success: true, activeMode: this.activeMode, message: `Mode is already ${mode}` };
    }

    this.activeDataProvider.stop();

    switch (mode) {
      case 'MOCK_TEST':
        this.activeDataProvider = this.mockProvider;
        break;
      case 'HISTORICAL_REPLAY':
        this.activeDataProvider = this.historicalReplay;
        break;
      case 'LIVE_MARKET_DATA_PAPER':
        this.activeDataProvider = this.liveAngel;
        break;
      case 'PERSONAL_ACCOUNT_CONNECTED':
      case 'SIMULATED_REPLAY':
      default:
        this.activeDataProvider = this.simulatedReplay;
        break;
    }

    this.activeMode = mode;
    this.wireDataProvider(this.activeDataProvider);
    this.activeDataProvider.start();

    console.log(`[PROVIDER MANAGER] Active Provider Switched -> Mode: ${mode}`);
    return {
      success: true,
      activeMode: this.activeMode,
      message: `Successfully transitioned to ${mode}`
    };
  }

  public getMode(): ProviderMode {
    return this.activeMode;
  }

  public getActiveDataProvider(): BaseMarketDataProvider {
    return this.activeDataProvider;
  }

  public getMockProvider(): MockMarketDataProvider {
    return this.mockProvider;
  }

  public getHistoricalProvider(): HistoricalReplayProvider {
    return this.historicalReplay;
  }

  public getLiveAngelProvider(): LiveAngelMarketDataProvider {
    return this.liveAngel;
  }

  public getQuote(symbol: string): MarketQuote | undefined {
    return this.activeDataProvider.getQuote(symbol);
  }

  public getQuotes(): Record<string, MarketQuote> {
    return this.activeDataProvider.getQuotes();
  }

  public onTick(listener: (quote: MarketQuote) => void): () => void {
    this.externalListeners.push(listener);
    return () => {
      this.externalListeners = this.externalListeners.filter((l) => l !== listener);
    };
  }

  // Pre-Trade Execution Safety Gate
  public canTrade(): { canTrade: boolean; reason?: string } {
    const state = this.activeDataProvider.getState();
    if (!state.canTrade) {
      return {
        canTrade: false,
        reason: state.reason || `Trading blocked: active provider in ${state.status} status`
      };
    }
    return { canTrade: true };
  }

  public getDiagnostics(): ProviderDiagnostics {
    return {
      activeMode: this.activeMode,
      marketData: this.activeDataProvider.getState(),
      integrations: {
        google: this.google.getState(),
        telegram: this.telegram.getState()
      },
      timestamp: new Date().toISOString()
    };
  }

  public stopAll(): void {
    if (this.unsubscribeTick) {
      this.unsubscribeTick();
      this.unsubscribeTick = null;
    }
    this.simulatedReplay.stop();
    this.historicalReplay.stop();
    this.liveAngel.stop();
    this.mockProvider.stop();
  }
}

export const providerManager = new ProviderManager();

