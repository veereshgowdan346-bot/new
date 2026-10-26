export type ProviderMode =
  | 'MOCK_TEST'
  | 'HISTORICAL_REPLAY'
  | 'SIMULATED_REPLAY'
  | 'LIVE_MARKET_DATA_PAPER'
  | 'PERSONAL_ACCOUNT_CONNECTED';

export type ProviderStatus = 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED' | 'STANDBY';

export interface MarketQuote {
  symbol: string;
  token: string;
  price: number;
  change: number;
  pct: number;
  volume: string;
  timestamp: number;
  exchangeTimestamp?: number;
  receivedTimestamp?: number;
  dataAgeStatus?: 'FRESH' | 'STALE' | 'SIMULATED' | 'HISTORICAL';
  source: string;
  sequenceNumber?: number;
}

export interface MarketDataProviderState {
  mode: ProviderMode;
  status: ProviderStatus;
  isLiveConnected: boolean;
  isLiveStreaming?: boolean;
  feedSource: string;
  lastUpdate: number;
  reason?: string;
  isDataFresh: boolean;
  canTrade: boolean;
  quotesCount: number;
  liveTicksCount?: number;
  maskedClient: string;
  dataAgeStatus?: 'FRESH' | 'STALE' | 'SIMULATED' | 'HISTORICAL';
}

export interface GoogleAuthState {
  connected: boolean;
  emailMasked: string;
  scopes: string[];
  tokenExpiresInMs: number;
  stateToken: string | null;
}

export interface TelegramIntegrationState {
  connected: boolean;
  botUsername: string;
  maskedToken: string;
  webhookActive: boolean;
  processedUpdatesCount: number;
}

export interface ProviderDiagnostics {
  activeMode: ProviderMode;
  marketData: MarketDataProviderState;
  integrations: {
    google: GoogleAuthState;
    telegram: TelegramIntegrationState;
  };
  timestamp: string;
}

