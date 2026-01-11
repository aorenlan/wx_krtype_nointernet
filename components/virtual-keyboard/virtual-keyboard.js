Component({
  properties: {
    isOpen: {
      type: Boolean,
      value: false
    },
    isDarkMode: {
      type: Boolean,
      value: false
    },
    hintKey: {
      type: String,
      value: ''
    },
    showMistakeBtn: {
      type: Boolean,
      value: false
    },
    showHintBtn: {
      type: Boolean,
      value: false
    },
    isAnswerShown: {
      type: Boolean,
      value: false
    },
    iconEye: {
      type: String,
      value: ''
    },
    showMistakeGuide: {
      type: Boolean,
      value: false
    },
    showHelpBtn: {
      type: Boolean,
      value: false
    },
    helpCount: {
      type: Number,
      value: 0
    },
    helpDisabled: {
      type: Boolean,
      value: false
    },
    showSkipBtn: {
      type: Boolean,
      value: false
    },
    skipDisabled: {
      type: Boolean,
      value: false
    },
    showDanmakuBtn: {
      type: Boolean,
      value: false
    },
    danmakuOpen: {
      type: Boolean,
      value: false
    },
    danmakuPresets: {
      type: Array,
      value: []
    }
  },

  data: {
    rows: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm']
    ]
  },

  methods: {
    onKeyPress(e) {
      const key = e.currentTarget.dataset.key;
      this.triggerEvent('keypress', { key });
      wx.vibrateShort({ type: 'light' });
    },

    onDelete() {
      this.triggerEvent('delete');
      wx.vibrateShort({ type: 'light' });
    },

    onSubmit() {
      this.triggerEvent('submit');
      wx.vibrateShort({ type: 'medium' });
    },

    onClose() {
      this.triggerEvent('close');
    },

    onAddToMistakes() {
      this.triggerEvent('addtomistakes');
      this.triggerEvent('dismissguide');
      wx.vibrateShort({ type: 'medium' });
    },

    onToggleAnswer() {
      this.triggerEvent('toggleanswer');
    },

    onDismissGuide() {
      this.triggerEvent('dismissguide');
    },

    onHelp() {
      if (this.properties.helpDisabled) return;
      this.triggerEvent('help');
      wx.vibrateShort({ type: 'medium' });
    },

    onSkip() {
      if (this.properties.skipDisabled) return;
      this.triggerEvent('skip');
      wx.vibrateShort({ type: 'light' });
    },

    onDanmaku() {
      this.triggerEvent('danmaku');
      wx.vibrateShort({ type: 'light' });
    },

    onDanmakuPreset(e) {
      const text = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.text : '';
      const msg = String(text || '').trim();
      if (!msg) return;
      this.triggerEvent('danmakupreset', { text: msg });
      wx.vibrateShort({ type: 'light' });
    }
  }
});
