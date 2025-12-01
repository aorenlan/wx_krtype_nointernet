import { KEYBOARD_LAYOUT } from '../../constants/index';

Component({
  properties: {
    nextKeyToPress: {
      type: String,
      value: null
    },
    isShiftActive: {
      type: Boolean,
      value: false
    },
    visualMode: {
      type: String,
      value: 'korean'
    }
  },

  data: {
    layout: KEYBOARD_LAYOUT
  },

  methods: {
    handleKeyPress(e) {
      const keyData = e.currentTarget.dataset.key;
      // Logic from React: const charToSend = isShiftActive ? (k.shiftChar || k.char) : k.char;
      const charToSend = this.data.isShiftActive 
        ? (keyData.shiftChar || keyData.char) 
        : keyData.char;
      
      this.triggerEvent('keyPress', { key: charToSend });
    },

    handleSpacePress(e) {
      this.triggerEvent('keyPress', { key: 'SPACE' });
    }
  }
})
