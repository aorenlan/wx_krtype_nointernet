Component({
  properties: {
    selected: {
      type: Number,
      value: 0
    },
    dark: {
      type: Boolean,
      value: false
    },
    hidden: {
      type: Boolean,
      value: false
    }
  },
  data: {
    color: "#94a3b8",
    selectedColor: "#6366f1",
    list: [
      {
        pagePath: "/pages/nv-practice/index",
        iconPath: "/assets/tabbar/re_练习.png",
        selectedIconPath: "/assets/tabbar/re_练习.png",
        text: "练习"
      },
      {
        pagePath: "",
        iconPath: "/assets/tabbar/re_偷学.png",
        selectedIconPath: "/assets/tabbar/re_偷学.png",
        text: "语法"
      },
      {
        pagePath: "/pages/nv-settings/index",
        iconPath: "/assets/tabbar/re_设置.png",
        selectedIconPath: "/assets/tabbar/re_设置.png",
        text: "设置"
      }
    ]
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = data.index
      
      if (index === 1) { // 语法 Tab
        wx.showToast({
          title: '正在开发中',
          icon: 'none'
        })
        return
      }

      wx.switchTab({
        url,
        fail: () => {
          wx.redirectTo({ url })
        }
      })
    }
  }
})
