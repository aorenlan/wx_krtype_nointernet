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
    async switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path
      const index = data.index
      
      if (index === 1) { // 语法 Tab
        const settings = wx.getStorageSync('settings') || {};
        const category = String(settings.category || '');
        
        if (category === 'TOPIK Vocabulary') {
             wx.showToast({ title: '语法功能正在开发', icon: 'none' });
             return;
        }

        const m = category.match(/^Yonsei\s*(\d)$/i);
        if (!m) {
             wx.showToast({ title: '语法功能正在开发', icon: 'none' });
             return;
        }
        
        const bookNum = m[1];
        const book = `yansei${bookNum}`;
        let lessonId = String(settings.yonseiLessonId || '').trim();
        
        // 尝试自动获取第一课
        if (!lessonId) {
             try {
                // 动态引入 api 避免循环依赖或路径问题，尝试简单的 require
                // 注意：小程序 require 相对路径需要准确
                const { getYonseiLessons } = require('../../utils_nv/api.js');
                const lessons = await getYonseiLessons(category);
                if (lessons && lessons.length > 0) {
                    lessonId = String(lessons[0].id);
                }
             } catch (err) {
                 console.error('Auto fetch lesson failed', err);
             }
        }

        if (!lessonId) {
            wx.showToast({ title: '请先在练习页选择课次', icon: 'none' });
            return;
        }
        
        const targetUrl = `/subpackages/grammar/pages/index/index?book=${encodeURIComponent(book)}&lessonId=${encodeURIComponent(lessonId)}`;
        wx.navigateTo({ url: targetUrl });
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
