/**
 * CHINTU AI TRADING SYSTEM - Voice Assistant & Audio Dispatch Engine
 * Provides Web Speech Synthesis (Text-to-Speech) and Speech Recognition (Speech-to-Text)
 * with executive voice modulation, robust Kannada support, and markdown sanitation.
 */

// Markdown and finance text sanitizer for natural speech flow
export function sanitizeTextForSpeech(text, isKannada = false) {
  if (!text) return '';

  let cleaned = text
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove Markdown image syntax ![alt](url)
    .replace(/!\[.*?\]\(.*?\)/g, '')
    // Replace Markdown links [text](url) with just text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove Markdown headers (#, ##, ###)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Remove blockquote markers >
    .replace(/^>\s+/gm, '')
    // Remove all bold and italic stars and underscores
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/[*_]/g, '')
    // Remove table borders and pipes
    .replace(/\|/g, ', ')
    // Convert Rupee sign to spoken word
    .replace(/₹\s*([0-9,.]+)/g, isKannada ? '$1 ರೂಪಾಯಿ ' : '$1 Rupees ')
    .replace(/₹/g, isKannada ? ' ರೂಪಾಯಿ ' : ' Rupees ')
    // Financial acronyms expansion
    .replace(/\bP&L\b/gi, isKannada ? 'ಲಾಭ ಮತ್ತು ನಷ್ಟ' : 'P and L')
    .replace(/\bF&O\b/gi, 'Futures and Options')
    .replace(/\bSL\b/gi, 'Stop Loss')
    .replace(/\bRMS\b/gi, 'Risk Management System')
    .replace(/\bLTP\b/gi, 'Last Traded Price')
    .replace(/\bATR\b/gi, 'A T R')
    .replace(/\bVWAP\b/gi, 'Vee-Wap')
    .replace(/\bSTT\b/gi, 'Speech to text')
    .replace(/\bTTS\b/gi, 'Text to speech')
    .replace(/\bNSE\b/gi, 'N-S-E')
    .replace(/\bMCX\b/gi, 'M-C-X')
    // Replace bullet points and dashes
    .replace(/^[•\-\*]\s+/gm, ' ')
    // Strip technical symbols, brackets, braces, arrows, emojis
    .replace(/[⚡🎯🛡️📈📉▶️⏸️⏹️🔄🔍📊✨🔒🚨•\(\)\[\]\{\}#@~^&=+<>]/g, ' ')
    // Collapse multiple punctuation/spaces
    .replace(/[,]{2,}/g, ',')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

class VoiceAssistant {
  constructor() {
    this.speechSynthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.isMuted = false;
    this.announcementsEnabled = true;
    this.preferredVoice = null;
    this._speakingListeners = [];
    this._keepAliveInterval = null;

    if (typeof window !== 'undefined') {
      try {
        const savedMute = localStorage.getItem('chintu_voice_muted');
        if (savedMute !== null) this.isMuted = savedMute === 'true';

        const savedAnnounce = localStorage.getItem('chintu_voice_announcements');
        if (savedAnnounce !== null) this.announcementsEnabled = savedAnnounce === 'true';
      } catch (e) {
        console.warn('Voice storage note:', e);
      }

      if (this.speechSynthesis) {
        // Pre-load voices
        this.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
        this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.speechSynthesis) return [];
    const voices = this.speechSynthesis.getVoices();
    // Prefer Indian English voice, or smooth natural English voice for default
    this.preferredVoice =
      voices.find((v) => v.lang === 'en-IN' || v.name.includes('India')) ||
      voices.find((v) => v.name.includes('Natural') || v.name.includes('Google UK English Female') || v.name.includes('Google UK English Male')) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];
    return voices;
  }

  onSpeakingChange(listener) {
    if (typeof listener === 'function') {
      this._speakingListeners.push(listener);
    }
    return () => {
      this._speakingListeners = this._speakingListeners.filter((l) => l !== listener);
    };
  }

  _notifySpeakingState(isSpeaking) {
    if (this._speakingListeners) {
      this._speakingListeners.forEach((l) => {
        try {
          l(isSpeaking);
        } catch (e) {}
      });
    }
  }

  setMuted(muted) {
    this.isMuted = !!muted;
    try {
      localStorage.setItem('chintu_voice_muted', String(this.isMuted));
    } catch (e) {}
    if (this.isMuted) {
      this.stopSpeaking();
    }
  }

  setAnnouncementsEnabled(enabled) {
    this.announcementsEnabled = !!enabled;
    try {
      localStorage.setItem('chintu_voice_announcements', String(this.announcementsEnabled));
    } catch (e) {}
  }

  speak(text, { lang = 'en-IN', rate = 1.0, pitch = 1.0, onStart, onEnd, onError } = {}) {
    if (!this.speechSynthesis) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        this.speechSynthesis = window.speechSynthesis;
      } else {
        return;
      }
    }

    // Always ensure speech synthesis is unpaused and cancel any stale utterances
    try {
      if (this.speechSynthesis.paused) {
        this.speechSynthesis.resume();
      }
      this.speechSynthesis.cancel();
    } catch (e) {}

    const isKannada = lang === 'kn-IN' || lang.startsWith('kn');
    const cleanText = sanitizeTextForSpeech(text, isKannada);
    if (!cleanText) return;

    // For detailed reports, chunk text into a conversational executive segment
    // (up to 420 chars) to prevent browser TTS buffer freezes while hands-free
    const speechChunk = cleanText.length > 450 ? cleanText.slice(0, 420) + '...' : cleanText;

    const utterance = new SpeechSynthesisUtterance(speechChunk);
    utterance.lang = isKannada ? 'kn-IN' : lang;
    // Set pitch to 1.0 and speech rate to 0.90 for smooth, clear, and easily understandable Kannada pronunciation
    utterance.rate = isKannada ? 0.90 : rate;
    utterance.pitch = pitch;

    let voices = this.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) {
      voices = this.loadVoices();
    }

    if (isKannada) {
      const knVoice =
        voices.find((v) => v.lang === 'kn-IN' || v.lang === 'kn') ||
        voices.find((v) => v.name.toLowerCase().includes('kannada') || v.name.includes('ಕನ್ನಡ')) ||
        voices.find((v) => v.name.includes('Google ಕನ್ನಡ')) ||
        voices.find((v) => v.lang.startsWith('kn')) ||
        voices.find((v) => v.lang === 'en-IN' || v.name.includes('India')) ||
        this.preferredVoice;

      if (knVoice) utterance.voice = knVoice;
    } else if (this.preferredVoice) {
      utterance.voice = this.preferredVoice;
    }

    utterance.onstart = () => {
      this._notifySpeakingState(true);
      // Chromium keep-alive heartbeat while speaking
      if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = setInterval(() => {
        if (this.speechSynthesis && this.speechSynthesis.speaking) {
          this.speechSynthesis.pause();
          this.speechSynthesis.resume();
        } else {
          clearInterval(this._keepAliveInterval);
        }
      }, 5000);

      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
      this._notifySpeakingState(false);
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
      this._notifySpeakingState(false);
      if (onError) onError(e);
    };

    try {
      this.speechSynthesis.speak(utterance);
      if (this.speechSynthesis.paused) {
        this.speechSynthesis.resume();
      }
    } catch (e) {
      if (this._keepAliveInterval) clearInterval(this._keepAliveInterval);
      this._notifySpeakingState(false);
      console.warn('Speech synthesis playback error:', e);
    }
  }

  stopSpeaking() {
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
      this._notifySpeakingState(false);
    }
  }

  isSpeaking() {
    return !!(this.speechSynthesis && this.speechSynthesis.speaking);
  }

  announceTrade(trade) {
    if (!this.announcementsEnabled || this.isMuted) return;
    const botName = trade.bot || 'Authorized Bot';
    const action = trade.action || 'Trade';
    const symbol = trade.symbol || 'Asset';
    const text = `Sir, ${botName} executed a ${action} order on ${symbol}.`;
    this.speak(text, { rate: 1.05 });
  }

  announceQuorum(quorumCount, totalBots, asset) {
    if (!this.announcementsEnabled || this.isMuted) return;
    const text = `Consensus quorum formed: ${quorumCount} of ${totalBots} bots agree on ${asset || 'the setup'}.`;
    this.speak(text, { rate: 1.05 });
  }

  announceAlert(message) {
    if (!this.announcementsEnabled || this.isMuted) return;
    this.speak(`Alert: ${message}`, { rate: 1.05 });
  }
}

export const voiceAssistant = new VoiceAssistant();
