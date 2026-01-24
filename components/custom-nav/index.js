const app = getApp()

Component({
  options: {
    multipleSlots: true
  },
  properties: {
    title: {
      type: String,
      value: '韩词练习'
    },
    subtitle: {
      type: String,
      value: ''
    },
    progress: {
      type: String,
      value: '' // e.g. "1 / 5"
    },
    showSettings: {
      type: Boolean,
      value: true
    },
    theme: {
      type: String,
      value: 'light' // light or dark
    },
    showCheckin: {
      type: Boolean,
      value: false
    },
    checkinText: {
      type: String,
      value: ''
    },
    showBack: {
      type: Boolean,
      value: false
    },
    showHome: {
      type: Boolean,
      value: false
    },
    customBack: {
      type: Boolean,
      value: false
    },
    showSettingsTooltip: {
      type: Boolean,
      value: false
    },
    settingsTooltipText: {
      type: String,
      value: '可调整显示模式'
    },
    homeGuideText: {
      type: String,
      value: ''
    }
  },

  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    menuButtonHeight: 32,
    menuButtonTop: 0,
    capsulePaddingRight: 100
  },

  lifetimes: {
    attached() {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect()
      const windowWidth = windowInfo.windowWidth || 375
      let capsuleLeft = null
      if (typeof menuButtonInfo.left === 'number') capsuleLeft = menuButtonInfo.left
      else if (typeof menuButtonInfo.right === 'number' && typeof menuButtonInfo.width === 'number') capsuleLeft = menuButtonInfo.right - menuButtonInfo.width
      if (typeof capsuleLeft !== 'number') capsuleLeft = windowWidth - 100
      const rawPadding = Math.round(windowWidth - capsuleLeft + 12)
      const capsulePaddingRight = Math.min(140, Math.max(72, rawPadding))
      
      const statusBarHeight = windowInfo.statusBarHeight || 20
      
      this.setData({
        statusBarHeight: statusBarHeight,
        navBarHeight: (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height,
        menuButtonHeight: menuButtonInfo.height,
        menuButtonTop: menuButtonInfo.top,
        capsulePaddingRight
      })
    }
  },

  methods: {
    onBackTap() {
      if (this.properties.customBack) {
        this.triggerEvent('back')
        return
      }
      wx.navigateBack({
        delta: 1,
        fail: () => {
          wx.switchTab({ url: '/pages/index/index' })
        }
      })
    },
    onHomeTap() {
      wx.reLaunch({ url: '/pages/index/index' })
    },
    onSettingsTap() {
      this.triggerEvent('settings')
    },
    onCheckinTap() {
      this.triggerEvent('checkin')
    }
  }
})
