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
        pagePath: "/pages/news/index",
        iconPath: "/assets/tabbar/re_story.png",
        selectedIconPath: "/assets/tabbar/re_story.png",
        text: "News"
      },
      {
        pagePath: "/pages/story-workshop/index",
        iconPath: "/assets/tabbar/re_talk.png",
        selectedIconPath: "/assets/tabbar/re_talk.png",
        text: "故事坊"
      },
      {
        pagePath: "/pages/grammar-entry/index",
        iconPath: "/assets/tabbar/re_语法.png",
        selectedIconPath: "/assets/tabbar/re_语法.png",
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
      wx.switchTab({
        url,
        fail: () => {
          wx.redirectTo({ url })
        }
      })
    }
  }
})
