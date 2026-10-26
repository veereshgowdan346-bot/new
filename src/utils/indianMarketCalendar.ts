/**
 * CHINTU AI — INDIAN MARKET CALENDAR & TRADING SESSIONS
 *
 * Implements authoritative NSE, BSE, and MCX market hours, Indian national holidays,
 * and intraday session grid calculations.
 *
 * Adapted from day-trader-skill calendar logic for Indian exchanges:
 * - NSE / BSE Standard Equity & Derivatives Hours: 09:15 - 15:30 IST (75 five-minute bars).
 * - Opening Range Window: 09:15 - 09:30 IST (first 15 minutes, 3 five-minute bars).
 * - Intraday Entry Window: 09:20 - 15:15 IST (prevents entry in opening chaos and late afternoon).
 * - Intraday Auto-Square-Off / Flat-By Deadline: 15:25 IST.
 * - MCX Commodity Hours: 09:00 - 23:30 IST (23:55 during US Daylight Saving).
 */

export interface MarketSessionStatus {
  isOpen: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isEarlyClose: boolean;
  currentSession: 'EQUITY' | 'COMMODITY' | 'CLOSED';
  minutesSinceOpen: number;
  minutesToClose: number;
  currentBarIndex: number; // 0 to 74 for equity
  isEntryWindowOpen: boolean;
  isSquareOffTime: boolean;
  istTimeString: string;
}

export const NSE_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-26': 'Republic Day',
  '2026-02-18': 'Mahashivratri',
  '2026-03-03': 'Holi',
  '2026-03-21': 'Id-Ul-Fitr (Ramzan Id)',
  '2026-03-27': 'Ram Navami',
  '2026-03-31': 'Mahavir Jayanti',
  '2026-04-03': 'Good Friday',
  '2026-04-14': 'Dr. Baba Saheb Ambedkar Jayanti',
  '2026-05-01': 'Maharashtra Day',
  '2026-05-28': 'Bakri Id / Eid ul-Adha',
  '2026-06-26': 'Muharram',
  '2026-08-15': 'Independence Day',
  '2026-09-04': 'Janmashtami',
  '2026-10-02': 'Mahatma Gandhi Jayanti',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali Laxmi Pujan (Muhurat Trading)',
  '2026-11-10': 'Diwali Balipratipada',
  '2026-11-24': 'Gurunanak Jayanti',
  '2026-12-25': 'Christmas'
};

export const NSE_HOLIDAYS_2027: Record<string, string> = {
  '2027-01-26': 'Republic Day',
  '2027-03-10': 'Id-Ul-Fitr',
  '2027-03-22': 'Holi',
  '2027-03-26': 'Good Friday',
  '2027-04-14': 'Dr. Ambedkar Jayanti',
  '2027-05-01': 'Maharashtra Day',
  '2027-08-15': 'Independence Day',
  '2027-10-02': 'Mahatma Gandhi Jayanti',
  '2027-10-28': 'Diwali Laxmi Pujan',
  '2027-12-25': 'Christmas'
};

export class IndianMarketCalendar {
  public static readonly EQUITY_OPEN_MINUTES = 9 * 60 + 15; // 09:15 IST = 555 mins
  public static readonly EQUITY_CLOSE_MINUTES = 15 * 60 + 30; // 15:30 IST = 930 mins
  public static readonly TOTAL_EQUITY_BARS_5M = 75; // (930 - 555) / 5 = 75 bars

  public static readonly ENTRY_WINDOW_START = 9 * 60 + 20; // 09:20 IST
  public static readonly ENTRY_WINDOW_END = 15 * 60 + 15; // 15:15 IST
  public static readonly SQUARE_OFF_MINUTES = 15 * 60 + 25; // 15:25 IST

  public static readonly MCX_OPEN_MINUTES = 9 * 60; // 09:00 IST = 540 mins
  public static readonly MCX_CLOSE_MINUTES = 23 * 60 + 30; // 23:30 IST = 1410 mins

  /**
   * Converts a Date or timestamp to IST (UTC+5:30) components
   */
  public static toIST(dateOrTimestamp: Date | number = Date.now()): {
    year: number;
    month: number;
    day: number;
    dateStr: string;
    hours: number;
    minutes: number;
    seconds: number;
    totalMinutes: number;
    dayOfWeek: number;
    timeString: string;
  } {
    const d = typeof dateOrTimestamp === 'number' ? new Date(dateOrTimestamp) : dateOrTimestamp;
    // IST is UTC + 5 hours 30 minutes
    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
    const istTime = new Date(utcTime + (5.5 * 3600000));

    const year = istTime.getFullYear();
    const month = istTime.getMonth() + 1;
    const day = istTime.getDate();
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const seconds = istTime.getSeconds();
    const totalMinutes = hours * 60 + minutes;
    const dayOfWeek = istTime.getDay(); // 0 = Sunday, 6 = Saturday

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} IST`;

    return {
      year,
      month,
      day,
      dateStr,
      hours,
      minutes,
      seconds,
      totalMinutes,
      dayOfWeek,
      timeString
    };
  }

  /**
   * Check if a specific IST date is a trading holiday
   */
  public static isHoliday(dateStr: string): { isHoliday: boolean; holidayName?: string } {
    if (NSE_HOLIDAYS_2026[dateStr]) {
      return { isHoliday: true, holidayName: NSE_HOLIDAYS_2026[dateStr] };
    }
    if (NSE_HOLIDAYS_2027[dateStr]) {
      return { isHoliday: true, holidayName: NSE_HOLIDAYS_2027[dateStr] };
    }
    return { isHoliday: false };
  }

  /**
   * Get complete market session status for a given point in time
   */
  public static getSessionStatus(dateOrTimestamp: Date | number = Date.now()): MarketSessionStatus {
    const ist = this.toIST(dateOrTimestamp);
    const isWeekend = ist.dayOfWeek === 0 || ist.dayOfWeek === 6;
    const holidayInfo = this.isHoliday(ist.dateStr);

    if (isWeekend || holidayInfo.isHoliday) {
      return {
        isOpen: false,
        isHoliday: holidayInfo.isHoliday,
        holidayName: holidayInfo.holidayName || (isWeekend ? 'Weekend' : undefined),
        isEarlyClose: false,
        currentSession: 'CLOSED',
        minutesSinceOpen: 0,
        minutesToClose: 0,
        currentBarIndex: -1,
        isEntryWindowOpen: false,
        isSquareOffTime: false,
        istTimeString: ist.timeString
      };
    }

    const isEquityOpen = ist.totalMinutes >= this.EQUITY_OPEN_MINUTES && ist.totalMinutes < this.EQUITY_CLOSE_MINUTES;
    const isMCXOpen = ist.totalMinutes >= this.MCX_OPEN_MINUTES && ist.totalMinutes < this.MCX_CLOSE_MINUTES;

    const currentSession = isEquityOpen ? 'EQUITY' : isMCXOpen ? 'COMMODITY' : 'CLOSED';
    const isOpen = isEquityOpen || isMCXOpen;

    const minutesSinceOpen = isEquityOpen ? (ist.totalMinutes - this.EQUITY_OPEN_MINUTES) : 0;
    const minutesToClose = isEquityOpen ? (this.EQUITY_CLOSE_MINUTES - ist.totalMinutes) : 0;
    const currentBarIndex = isEquityOpen ? Math.floor(minutesSinceOpen / 5) : -1;

    const isEntryWindowOpen = isEquityOpen && ist.totalMinutes >= this.ENTRY_WINDOW_START && ist.totalMinutes <= this.ENTRY_WINDOW_END;
    const isSquareOffTime = isEquityOpen && ist.totalMinutes >= this.SQUARE_OFF_MINUTES;

    return {
      isOpen,
      isHoliday: false,
      isEarlyClose: false,
      currentSession,
      minutesSinceOpen,
      minutesToClose,
      currentBarIndex: Math.min(this.TOTAL_EQUITY_BARS_5M - 1, Math.max(-1, currentBarIndex)),
      isEntryWindowOpen,
      isSquareOffTime,
      istTimeString: ist.timeString
    };
  }

  /**
   * Get 5-minute bar start and end times for a bar index (0 to 74)
   */
  public static getBarTimeRange(barIndex: number): { startStr: string; endStr: string; startMinutes: number; endMinutes: number } {
    const clampedIndex = Math.max(0, Math.min(this.TOTAL_EQUITY_BARS_5M - 1, barIndex));
    const startMins = this.EQUITY_OPEN_MINUTES + (clampedIndex * 5);
    const endMins = startMins + 5;

    const startH = Math.floor(startMins / 60);
    const startM = startMins % 60;
    const endH = Math.floor(endMins / 60);
    const endM = endMins % 60;

    return {
      startStr: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
      endStr: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      startMinutes: startMins,
      endMinutes: endMins
    };
  }
}

