export class SpeechManager {
    private static instance: SpeechManager;
    private voices: SpeechSynthesisVoice[] = [];
    private selectedVoice: SpeechSynthesisVoice | null = null;
    private enabled: boolean = true;

    private constructor() {
        if ('speechSynthesis' in window) {
            // Chrome loads voices asynchronously
            window.speechSynthesis.onvoiceschanged = () => {
                this.loadVoices();
            };
            this.loadVoices();
        }
    }

    public static getInstance(): SpeechManager {
        if (!SpeechManager.instance) {
            SpeechManager.instance = new SpeechManager();
        }
        return SpeechManager.instance;
    }

    private loadVoices() {
        this.voices = window.speechSynthesis.getVoices();
        // 1. Try to find a Slovak voice
        this.selectedVoice = this.voices.find(v => v.lang.startsWith('sk')) || null;

        // 2. Fallback to English (Google / Microsoft)
        if (!this.selectedVoice) {
            this.selectedVoice = this.voices.find(v => v.localService) || this.voices[0];
        }

        console.log('Voices loaded. Selected:', this.selectedVoice?.name, this.selectedVoice?.lang);
    }

    public speak(text: string, interrupt: boolean = true) {
        if (!this.enabled || !('speechSynthesis' in window)) return;

        // Cancel previous speech to avoid queue buildup only if interrupt is true
        if (interrupt) {
            window.speechSynthesis.cancel();
        }

        // Split text into sentences to create natural pauses
        const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

        sentences.forEach((sentence, index) => {
            const utterance = new SpeechSynthesisUtterance(sentence.trim());
            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }

            // Adjust properties for "AI" feel
            utterance.rate = 0.9; // Slightly slower for better clarity
            utterance.pitch = 1.0;

            window.speechSynthesis.speak(utterance);

            // Add a small silent pause after sentences (except the last one)
            if (index < sentences.length - 1) {
                // Hack: Speak a space to create a tiny gap, or potentially a comma if invisible
                // Some browsers ignore empty/whitespace utterances, but splitting usually adds a small gap anyway.
                // Let's rely on the separate utterance overhead first.
            }
        });
    }

    public toggle(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) window.speechSynthesis.cancel();
    }
}

export const speech = SpeechManager.getInstance();
